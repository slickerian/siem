from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional
import sqlite3
import json
from datetime import datetime, timedelta, timezone
import io
import csv
import asyncio

app = FastAPI()

# Allow frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Change to frontend URL in prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_FILE = "siem.db"

# -----------------------------
# Database Helpers
# -----------------------------
def get_db():
    conn = sqlite3.connect(DB_FILE, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            event_type TEXT NOT NULL,
            data TEXT NOT NULL
        )
    """)
    conn.commit()
    conn.close()

init_db()

# -----------------------------
# Models
# -----------------------------
class LogIn(BaseModel):
    event_type: str
    data: str

class LogEntry(BaseModel):
    id: int
    created_at: str
    event_type: str
    data: str

# -----------------------------
# Helpers
# -----------------------------
def parse_time(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value).replace(tzinfo=timezone.utc).isoformat()
    except ValueError:
        try:
            return datetime.strptime(value, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc).isoformat()
        except ValueError:
            raise ValueError(f"Invalid date format: {value}")

# -----------------------------
# WebSocket clients
# -----------------------------
active_connections: List[WebSocket] = []

async def broadcast(payload: dict):
    to_remove = []
    coros = []
    for ws in active_connections:
        coros.append(ws.send_text(json.dumps(payload)))
    results = await asyncio.gather(*coros, return_exceptions=True)
    for i, res in enumerate(results):
        if isinstance(res, Exception):
            to_remove.append(active_connections[i])
    for ws in to_remove:
        active_connections.remove(ws)

# -----------------------------
# /log - ingestion from nodes
# -----------------------------
@app.post("/log")
async def ingest_log(log: LogIn):
    now = datetime.utcnow().replace(tzinfo=timezone.utc).isoformat()
    conn = get_db()
    cur = conn.cursor()

    # Insert the new log
    cur.execute(
        "INSERT INTO logs (created_at, event_type, data) VALUES (?, ?, ?)",
        (now, log.event_type, log.data),
    )
    conn.commit()

    # Calculate totals
    total_count = cur.execute("SELECT COUNT(*) FROM logs").fetchone()[0]

    # Critical logs
    critical_count = cur.execute(
        "SELECT COUNT(*) FROM logs WHERE UPPER(TRIM(event_type)) IN ('ERROR','CRITICAL','FAIL','ACTION_FAILED')"
    ).fetchone()[0]

    # Last 24h logs
    since = (datetime.utcnow() - timedelta(hours=24)).replace(tzinfo=timezone.utc).isoformat()
    last24h_count = cur.execute(
        "SELECT COUNT(*) FROM logs WHERE created_at >= ?", (since,)
    ).fetchone()[0]

    # Average per hour
    first_log_time = cur.execute("SELECT MIN(created_at) FROM logs").fetchone()[0]
    first_log_time = datetime.fromisoformat(first_log_time) if first_log_time else datetime.utcnow()
    hours_elapsed = max(1, (datetime.utcnow() - first_log_time).total_seconds() / 3600)
    avg_per_hour = round(total_count / hours_elapsed)

    payload = {
        "event_type": log.event_type,
        "data": log.data,
        "created_at": now,
        "total": total_count,
        "critical": critical_count,
        "last24h": last24h_count,
        "avgPerHour": avg_per_hour,
    }

    await broadcast(payload)
    conn.close()
    return {"status": "ok"}


# -----------------------------
# /ws - realtime updates
# -----------------------------
@app.websocket("/ws/logs")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    active_connections.append(ws)
    try:
        while True:
            await ws.receive_text()  # keep-alive
    except WebSocketDisconnect:
        if ws in active_connections:
            active_connections.remove(ws)

# -----------------------------
# /api/logs - fetch logs
# -----------------------------
@app.get("/api/logs")
def get_logs(
    limit: int = Query(ge=1, le=5000),
    offset: int = Query(0, ge=0),
    event_type: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    start: Optional[str] = Query(None),
    end: Optional[str] = Query(None),
):
    conn = get_db()
    cur = conn.cursor()

    # Base query for fetching logs
    query = "SELECT * FROM logs WHERE 1=1"
    params: List = []

    if event_type:
        query += " AND event_type = ?"
        params.append(event_type)
    if q:
        query += " AND (LOWER(event_type) LIKE LOWER(?) OR LOWER(data) LIKE LOWER(?))"
        params.extend([f"%{q}%", f"%{q}%"])
    if start:
        query += " AND created_at >= ?"
        params.append(parse_time(start))
    if end:
        query += " AND created_at <= ?"
        params.append(parse_time(end))

    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])
    rows = cur.execute(query, params).fetchall()

    # ✅ Build base condition for stats (same filters)
    base_query = "FROM logs WHERE 1=1"
    stats_params: List = []

    if event_type:
        base_query += " AND event_type = ?"
        stats_params.append(event_type)
    if q:
        base_query += " AND (LOWER(event_type) LIKE LOWER(?) OR LOWER(data) LIKE LOWER(?))"
        stats_params.extend([f"%{q}%", f"%{q}%"])
    if start:
        base_query += " AND created_at >= ?"
        stats_params.append(parse_time(start))
    if end:
        base_query += " AND created_at <= ?"
        stats_params.append(parse_time(end))

    # ✅ Stats now respect filters
    total = cur.execute(f"SELECT COUNT(*) {base_query}", stats_params).fetchone()[0]


    # Build separate query for critical that ignores event_type but keeps q/start/end
    critical_query = "FROM logs WHERE 1=1"
    critical_params: List = []

    if q:
        critical_query += " AND (LOWER(event_type) LIKE LOWER(?) OR LOWER(data) LIKE LOWER(?))"
        critical_params.extend([f"%{q}%", f"%{q}%"])
    if start:
        critical_query += " AND created_at >= ?"
        critical_params.append(parse_time(start))
    if end:
        critical_query += " AND created_at <= ?"
        critical_params.append(parse_time(end))

    critical = cur.execute(
        f"SELECT COUNT(*) {critical_query} AND UPPER(TRIM(event_type)) IN ('ERROR','CRITICAL','FAIL','ACTION_FAILED')",
        critical_params,
    ).fetchone()[0]



    since = (datetime.utcnow() - timedelta(hours=24)).replace(tzinfo=timezone.utc).isoformat()
    last24h = cur.execute(
        f"SELECT COUNT(*) {base_query} AND created_at >= ?",
        stats_params + [since],
    ).fetchone()[0]

    first_log_time_row = cur.execute(
        f"SELECT MIN(created_at) {base_query}",
        stats_params,
    ).fetchone()[0]
    first_log_time = datetime.fromisoformat(first_log_time_row) if first_log_time_row else datetime.utcnow()
    hours_elapsed = max(1, (datetime.utcnow() - first_log_time).total_seconds() / 3600)
    avg_per_hour = round(total / hours_elapsed)

    conn.close()

    return {
        "total": total,
        "critical": critical,
        "last24h": last24h,
        "avgPerHour": avg_per_hour,
        "items": [dict(row) for row in rows],
    }


# -----------------------------
# /api/stats - stats for charts
# -----------------------------
@app.get("/api/stats")
def get_stats(
    event_type: Optional[str] = None,
    q: Optional[str] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
    bucket_minutes: int = 5,
):
    conn = get_db()
    cur = conn.cursor()

    filters = "WHERE 1=1"
    params: List = []

    if event_type:
        filters += " AND event_type = ?"
        params.append(event_type)
    if q:
        filters += " AND (LOWER(event_type) LIKE LOWER(?) OR LOWER(data) LIKE LOWER(?))"
        params.extend([f"%{q}%", f"%{q}%"])
    if start:
        filters += " AND created_at >= ?"
        params.append(parse_time(start))
    if end:
        filters += " AND created_at <= ?"
        params.append(parse_time(end))

    histo = cur.execute(
        f"SELECT event_type, COUNT(*) as count FROM logs {filters} GROUP BY event_type",
        params,
    ).fetchall()

    times = cur.execute(
        f"""
        SELECT 
            strftime('%Y-%m-%d %H:%M:00', created_at) as bucket,
            COUNT(*) as count
        FROM logs {filters}
        GROUP BY bucket
        ORDER BY bucket
        """,
        params,
    ).fetchall()

    conn.close()

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
def export_logs():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM logs ORDER BY created_at DESC")

    def iter_csv():
        writer = csv.writer(io.StringIO())
        yield "id,created_at,event_type,data\n"
        for row in cur:
            yield f"{row['id']},{row['created_at']},{row['event_type']},{row['data']}\n"

    response = StreamingResponse(iter_csv(), media_type="text/csv")
    response.headers["Content-Disposition"] = "attachment; filename=logs.csv"
    return response
