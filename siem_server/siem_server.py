#siem_server.py
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional, Dict
import json
from datetime import datetime, timedelta, timezone
import io
import csv
import asyncio
import logging
import time
from database import db_manager
from collections import defaultdict

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = FastAPI(title="SIEM Server", version="1.0.0")

# Allow frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Change to frontend URL in prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Start background cleanup task
@app.on_event("startup")
async def startup_event():
    logger.info("Starting SIEM server with background cleanup task")
    asyncio.create_task(node_cleanup_task())

# Global stats cache to avoid expensive recalculations
stats_cache = {
    'total_logs': 0,
    'critical_count': 0,
    'last24h_count': 0,
    'avg_per_hour': 0,
    'last_updated': None
}

CACHE_TTL_SECONDS = 30  # Cache stats for 30 seconds

# -----------------------------
# Models
# -----------------------------
class LogIn(BaseModel):
    node_id: str
    event_type: str
    data: str

class LogEntry(BaseModel):
    id: int
    node_id: str
    created_at: str
    event_type: str
    data: str

# -----------------------------
# Helpers
# -----------------------------
def get_cached_stats() -> Dict[str, int]:
    """Get stats with caching to avoid expensive recalculations"""
    now = datetime.now(timezone.utc)

    # Check if cache is still valid
    if (stats_cache['last_updated'] and
        (now - stats_cache['last_updated']).total_seconds() < CACHE_TTL_SECONDS):
        logger.debug("Returning cached stats")
        return {
            'total_logs': stats_cache['total_logs'],
            'critical_count': stats_cache['critical_count'],
            'last24h_count': stats_cache['last24h_count'],
            'avg_per_hour': stats_cache['avg_per_hour']
        }

    # Calculate fresh stats
    logger.debug("Calculating fresh stats (cache expired)")
    with db_manager.get_connection() as conn:
        cur = conn.cursor()

        # Total logs
        row = cur.execute("SELECT COUNT(*) FROM logs").fetchone()
        total_logs = row[0] if row else 0

        # Critical logs
        row = cur.execute(
            "SELECT COUNT(*) FROM logs WHERE UPPER(TRIM(event_type)) IN ('ERROR','CRITICAL','FAIL','ACTION_FAILED')"
        ).fetchone()
        critical_count = row[0] if row else 0

        # Last 24h logs - use proper datetime comparison
        since = now - timedelta(hours=24)
        row = cur.execute("SELECT COUNT(*) FROM logs WHERE datetime(created_at) >= datetime(?)", (since.isoformat(),)).fetchone()
        last24h_count = row[0] if row else 0

        # Average per hour - calculate based on last 24h activity for more accuracy
        if last24h_count > 0:
            avg_per_hour = round(last24h_count / 24)  # events per hour over last 24h
        else:
            # Fallback to total logs over system uptime for new systems
            row = cur.execute("SELECT MIN(created_at) FROM logs").fetchone()
            first_log_time_str = row[0] if row else None

            if first_log_time_str and total_logs > 0:
                try:
                    first_log_time = datetime.fromisoformat(first_log_time_str)
                    hours_elapsed = max(1, (now - first_log_time).total_seconds() / 3600)
                    avg_per_hour = round(total_logs / hours_elapsed)
                except Exception:
                    avg_per_hour = 0
            else:
                avg_per_hour = 0

    # Update cache
    stats_cache.update({
        'total_logs': total_logs,
        'critical_count': critical_count,
        'last24h_count': last24h_count,
        'avg_per_hour': avg_per_hour,
        'last_updated': now
    })

    logger.debug(f"Updated stats cache: total={total_logs}, critical={critical_count}")
    return stats_cache.copy()


    def parse_db_datetime(value: Optional[str]) -> datetime:
        """Safely parse a datetime string from the DB into a timezone-aware UTC datetime.

        If parsing fails or the value is None, return current UTC time. This protects
        against unexpected formats stored in `created_at`.
        """
        if not value:
            return datetime.now(timezone.utc)
        try:
            # Try Python's ISO parser first
            dt = datetime.fromisoformat(value)
            if dt.tzinfo is None:
                # Assume UTC if no tz provided
                dt = dt.replace(tzinfo=timezone.utc)
            else:
                # Normalize to UTC
                dt = dt.astimezone(timezone.utc)
            return dt
        except Exception:
            # Try common fallback format
            try:
                dt = datetime.strptime(value, "%Y-%m-%d %H:%M:%S")
                return dt.replace(tzinfo=timezone.utc)
            except Exception:
                # Last resort: now
                return datetime.now(timezone.utc)

# -----------------------------
# Node status tracking with automatic cleanup
# -----------------------------
node_status: Dict[str, datetime] = {}  # node_id -> last_seen timestamp

def cleanup_old_nodes():
    """Remove nodes that haven't been seen in the last 10 minutes"""
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(minutes=10)
    to_remove = [node_id for node_id, last_seen in node_status.items() if last_seen < cutoff]

    for node_id in to_remove:
        del node_status[node_id]
        logger.info(f"Cleaned up offline node: {node_id}")

    if to_remove:
        logger.info(f"Cleaned up {len(to_remove)} offline nodes")

# Run cleanup every 5 minutes
async def node_cleanup_task():
    while True:
        await asyncio.sleep(300)  # 5 minutes
        cleanup_old_nodes()

# -----------------------------
# WebSocket clients
# -----------------------------
active_connections: List[WebSocket] = []

async def broadcast(payload: dict):
    """Broadcast to all WebSocket connections asynchronously"""
    if not active_connections:
        return

    logger.debug(f"Broadcasting to {len(active_connections)} WebSocket connections")

    # Create tasks for parallel sending
    tasks = []
    for ws in active_connections:
        task = asyncio.create_task(ws.send_text(json.dumps(payload)))
        tasks.append(task)

    # Wait for all tasks to complete, but don't fail on individual errors
    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Clean up failed connections
    failed_indices = []
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            logger.warning(f"Failed to send to WebSocket client {i}: {result}")
            failed_indices.append(i)

    # Remove failed connections (in reverse order to maintain indices)
    for i in reversed(failed_indices):
        ws = active_connections.pop(i)

    if failed_indices:
        logger.info(f"Removed {len(failed_indices)} failed WebSocket connections")

# -----------------------------
# /log - ingestion from nodes
# -----------------------------
@app.post("/log")
async def ingest_log(log: LogIn):
    logger.info(f"Ingesting log from node {log.node_id}: {log.event_type}")
    start_time = time.time()

    # Validate input
    if not log.node_id or not log.event_type:
        logger.warning(f"Invalid log data: missing node_id or event_type")
        raise HTTPException(status_code=400, detail="node_id and event_type are required")

    if len(log.node_id) > 100 or len(log.event_type) > 100:
        logger.warning(f"Field too long: node_id={len(log.node_id)}, event_type={len(log.event_type)}")
        raise HTTPException(status_code=400, detail="node_id and event_type must be <= 100 characters")

    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    ist_time = now + timedelta(hours=5, minutes=30)  # Kolkata is UTC+5:30
    logger.debug(f"Current UTC time: {now}, IST time: {ist_time}, ISO format: {now_iso}")
    node_status[log.node_id] = now  # update last seen

    try:
        # Insert the new log using database manager
        db_manager.execute_query(
            "INSERT INTO logs (node_id, created_at, event_type, data) VALUES (?, ?, ?, ?)",
            (log.node_id, now_iso, log.event_type, log.data),
            fetch=False
        )
        logger.debug(f"Log inserted successfully for node {log.node_id}")

        # Invalidate cache when new log is added
        global stats_cache
        stats_cache['last_updated'] = None

    except Exception as e:
        logger.error(f"Failed to insert log for node {log.node_id}: {e}")
        raise HTTPException(status_code=500, detail="Database insertion failed")

    # Get cached stats (much faster than recalculating)
    stats = get_cached_stats()

    payload = {
        "node_id": log.node_id,
        "event_type": log.event_type,
        "data": log.data,
        "created_at": now_iso,
        "timestamp_local": now.astimezone().isoformat(),  # Include local time for display
        "total": stats['total_logs'],
        "critical": stats['critical_count'],
        "last24h": stats['last24h_count'],
        "avgPerHour": stats['avg_per_hour'],
    }

    try:
        await broadcast(payload)
    except Exception as e:
        logger.error(f"Failed to broadcast log: {e}")
        # Don't fail the request if broadcast fails

    total_time = time.time() - start_time
    logger.info(f"Log ingestion completed in {total_time:.4f}s for node {log.node_id}")
    return {"status": "ok"}

# -----------------------------
# /ws - realtime updates
# -----------------------------
@app.websocket("/ws/logs")
async def websocket_endpoint(ws: WebSocket):
    logger.info("New WebSocket connection accepted")
    await ws.accept()
    active_connections.append(ws)
    logger.debug(f"Active WebSocket connections: {len(active_connections)}")
    try:
        while True:
            await ws.receive_text()  # keep-alive
    except WebSocketDisconnect:
        logger.info("WebSocket connection closed")
        if ws in active_connections:
            active_connections.remove(ws)
        logger.debug(f"Active WebSocket connections: {len(active_connections)}")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        if ws in active_connections:
            active_connections.remove(ws)

# -----------------------------
# /api/nodes - list all nodes + online status
# -----------------------------
@app.get("/api/nodes")
def get_nodes():
    logger.debug("Fetching node list")
    rows = db_manager.execute_query("SELECT DISTINCT node_id FROM logs")

    now = datetime.now(timezone.utc)
    nodes = []
    for r in rows:
        nid = r["node_id"]
        last_seen = node_status.get(nid)
        online = last_seen and (now - last_seen).total_seconds() < 10  # online if seen in last 10s
        nodes.append({"node_id": nid, "online": bool(online)})

    logger.debug(f"Returning {len(nodes)} nodes")
    return nodes

# -----------------------------
# /api/logs - fetch logs (supports node_id)
# -----------------------------
@app.get("/api/logs")
def get_logs(
    limit: int = Query(ge=1, le=5000),
    offset: int = Query(0, ge=0),
    node_id: Optional[str] = Query(None),
    event_type: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    start: Optional[str] = Query(None),
    end: Optional[str] = Query(None),
):
    logger.info(f"API /logs called with limit={limit}, offset={offset}, node_id={node_id}")
    start_time = time.time()

    # Validate parameters
    if limit > 5000:
        logger.warning(f"Limit too high: {limit}, capping at 5000")
        limit = 5000
    if offset < 0:
        logger.warning(f"Invalid offset: {offset}, setting to 0")
        offset = 0

    # Build query with proper filtering
    query = "SELECT * FROM logs WHERE 1=1"
    params: List = []
    filters_applied = []

    if node_id:
        query += " AND node_id = ?"
        params.append(node_id)
        filters_applied.append(f"node_id={node_id}")
    if event_type:
        query += " AND event_type = ?"
        params.append(event_type)
        filters_applied.append(f"event_type={event_type}")
    if q:
        query += " AND (LOWER(event_type) LIKE LOWER(?) OR LOWER(data) LIKE LOWER(?))"
        params.extend([f"%{q}%", f"%{q}%"])
        filters_applied.append(f"q={q}")
    if start:
        query += " AND datetime(created_at) >= datetime(?)"
        params.append(start)
        filters_applied.append(f"start={start}")
    if end:
        query += " AND datetime(created_at) <= datetime(?)"
        params.append(end)
        filters_applied.append(f"end={end}")

    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    logger.debug(f"Executing query with filters: {', '.join(filters_applied) if filters_applied else 'none'}")
    rows = db_manager.execute_query(query, params)

    # Base query for stats
    base_query = "FROM logs WHERE 1=1"
    stats_params: List = []

    if node_id:
        base_query += " AND node_id = ?"
        stats_params.append(node_id)
    if event_type:
        base_query += " AND event_type = ?"
        stats_params.append(event_type)
    if q:
        base_query += " AND (LOWER(event_type) LIKE LOWER(?) OR LOWER(data) LIKE LOWER(?))"
        stats_params.extend([f"%{q}%", f"%{q}%"])
    if start:
        base_query += " AND datetime(created_at) >= datetime(?)"
        stats_params.append(start)
    if end:
        base_query += " AND datetime(created_at) <= datetime(?)"
        stats_params.append(end)

    # Get total count for current filters
    total_query = f"SELECT COUNT(*) {base_query}"
    total_result = db_manager.execute_query(total_query, stats_params)
    total = total_result[0][0] if total_result else 0

    # Use cached global stats for performance (since filters don't affect critical count logic)
    global_stats = get_cached_stats()
    critical = global_stats['critical_count']
    last24h = global_stats['last24h_count']
    avg_per_hour = global_stats['avg_per_hour']

    logger.debug(f"Stats: total={total}, critical={critical}, last24h={last24h}")

    total_time = time.time() - start_time
    logger.info(f"/api/logs completed in {total_time:.4f}s, returned {len(rows)} items, total in DB: {total}")

    return {
        "total": total,
        "critical": critical,
        "last24h": last24h,
        "avgPerHour": avg_per_hour,
        "items": [dict(row) for row in rows],
    }

# -----------------------------
# /api/stats - stats for charts (supports node_id)
# -----------------------------
@app.get("/api/stats")
def get_stats(
    node_id: Optional[str] = None,
    event_type: Optional[str] = None,
    q: Optional[str] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
    bucket_minutes: int = 5,
):
    logger.debug(f"Stats API called with filters: node_id={node_id}, event_type={event_type}")

    filters = "WHERE 1=1"
    params: List = []

    if node_id:
        filters += " AND node_id = ?"
        params.append(node_id)
    if event_type:
        filters += " AND event_type = ?"
        params.append(event_type)
    if q:
        filters += " AND (LOWER(event_type) LIKE LOWER(?) OR LOWER(data) LIKE LOWER(?))"
        params.extend([f"%{q}%", f"%{q}%"])
    if start:
        filters += " AND datetime(created_at) >= datetime(?)"
        params.append(start)
    if end:
        filters += " AND datetime(created_at) <= datetime(?)"
        params.append(end)

    # Event type histogram
    histo_query = f"SELECT event_type, COUNT(*) as count FROM logs {filters} GROUP BY event_type"
    histo = db_manager.execute_query(histo_query, params)

    # Time series data (bucketed by minute) - proper datetime handling
    times_query = f"""
    SELECT
        strftime('%Y-%m-%d %H:%M:00', created_at) as bucket,
        COUNT(*) as count
    FROM logs {filters}
    GROUP BY strftime('%Y-%m-%d %H:%M:00', created_at)
    ORDER BY bucket
    """
    times = db_manager.execute_query(times_query, params)

    return {
        "histogram": [dict(r) for r in histo],
        "timeseries": [dict(r) for r in times],
        "bucket_minutes": bucket_minutes,
        "start": start,
        "end": end,
    }

# -----------------------------
# /export.csv - streaming CSV
# -----------------------------
@app.get("/export.csv")
def export_csv(
    node_id: Optional[str] = Query(None),
    event_type: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    start: Optional[str] = Query(None),
    end: Optional[str] = Query(None),
):
    logger.info("CSV export requested with filters")
    start_time = time.time()

    # Build query with same filtering logic as API
    query = "SELECT id, node_id, created_at, event_type, data FROM logs WHERE 1=1"
    params: List = []

    if node_id:
        query += " AND node_id = ?"
        params.append(node_id)
    if event_type:
        query += " AND event_type = ?"
        params.append(event_type)
    if q:
        query += " AND (LOWER(event_type) LIKE LOWER(?) OR LOWER(data) LIKE LOWER(?))"
        params.extend([f"%{q}%", f"%{q}%"])
    if start:
        query += " AND datetime(created_at) >= datetime(?)"
        params.append(start)
    if end:
        query += " AND datetime(created_at) <= datetime(?)"
        params.append(end)

    query += " ORDER BY created_at DESC"

    rows = db_manager.execute_query(query, params)
    row_count = len(rows)

    def iter_csv():
        yield "id,node_id,created_at,event_type,data\n"
        for row in rows:
            # Escape CSV fields that might contain commas or quotes
            data = str(row['data']).replace('"', '""')  # Escape quotes
            yield f"{row['id']},{row['node_id']},{row['created_at']},{row['event_type']},\"{data}\"\n"

    response = StreamingResponse(iter_csv(), media_type="text/csv")
    response.headers["Content-Disposition"] = "attachment; filename=logs.csv"

    total_time = time.time() - start_time
    logger.info(f"CSV export completed in {total_time:.4f}s, exported {row_count} rows")
    return response
