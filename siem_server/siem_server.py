# siem_server.py
from __future__ import annotations
from fastapi.staticfiles import StaticFiles

from fastapi import FastAPI, Depends, HTTPException, status, WebSocket, WebSocketDisconnect, Query
from fastapi.responses import HTMLResponse, StreamingResponse, JSONResponse
from fastapi.security import APIKeyHeader
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
import sqlite3
import os
import json
import threading
from pydantic import BaseModel, Field

# -----------------------
# Config
# -----------------------
API_KEY = "secretkey"  # set as env var in production
API_KEY_HEADER = APIKeyHeader(name="X-API-Key", auto_error=True)
DB_FILE = "logs.db"

# -----------------------
# Database Utilities
# -----------------------
def get_conn():
    conn = sqlite3.connect(DB_FILE, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_conn()
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type TEXT,
            data TEXT,
            encrypted TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    c.execute("CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs(created_at)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_logs_event_type ON logs(event_type)")
    conn.commit()
    conn.close()

def insert_log(event_type: str, data: Any, encrypted: str) -> int:
    conn = get_conn()
    try:
        c = conn.cursor()
        if not isinstance(data, str):
            data = json.dumps(data, indent=2)
        c.execute(
            "INSERT INTO logs (event_type, data, encrypted) VALUES (?, ?, ?)",
            (event_type, data, encrypted),
        )
        conn.commit()
        new_id = c.lastrowid
        return new_id
    finally:
        conn.close()

def build_filters(
    event_type: Optional[str],
    q: Optional[str],
    start: Optional[str],
    end: Optional[str],
) -> (str, list):
    where = []
    params: List[Any] = []
    if event_type:
        where.append("event_type = ?")
        params.append(event_type)
    if q:
        where.append("(event_type LIKE ? OR data LIKE ?)")
        like = f"%{q}%"
        params.extend([like, like])
    if start:
        where.append("datetime(created_at) >= datetime(?)")
        params.append(start)
    if end:
        where.append("datetime(created_at) <= datetime(?)")
        params.append(end)
    clause = " WHERE " + " AND ".join(where) if where else ""
    return clause, params

def get_logs(
    limit: int = 50,
    offset: int = 0,
    event_type: Optional[str] = None,
    q: Optional[str] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
) -> List[sqlite3.Row]:
    clause, params = build_filters(event_type, q, start, end)
    sql = f"""
        SELECT id, created_at, event_type, data
        FROM logs
        {clause}
        ORDER BY id DESC
        LIMIT ? OFFSET ?
    """
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute(sql, params + [limit, offset])
        rows = cur.fetchall()
        return rows
    finally:
        conn.close()

def count_logs(
    event_type: Optional[str] = None,
    q: Optional[str] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
) -> int:
    clause, params = build_filters(event_type, q, start, end)
    sql = f"SELECT COUNT(*) as cnt FROM logs {clause}"
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute(sql, params)
        return cur.fetchone()[0]
    finally:
        conn.close()

def get_event_type_histogram(
    start: Optional[str],
    end: Optional[str],
) -> List[Dict[str, Any]]:
    clause, params = build_filters(None, None, start, end)
    sql = f"""
        SELECT event_type, COUNT(*) as count
        FROM logs
        {clause}
        GROUP BY event_type
        ORDER BY count DESC
    """
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute(sql, params)
        rows = cur.fetchall()
        return [{"event_type": r["event_type"], "count": r["count"]} for r in rows]
    finally:
        conn.close()

def get_timeseries(
    start: Optional[str],
    end: Optional[str],
    bucket_minutes: int = 5,
    event_type: Optional[str] = None,
    q: Optional[str] = None,
) -> List[Dict[str, Any]]:
    clause, params = build_filters(event_type, q, start, end)
    sql = f"""
        SELECT
          strftime('%Y-%m-%d %H:%M:00',
                   datetime((cast(strftime('%s', created_at) as integer) / (?*60)) * (?*60), 'unixepoch')
          ) as bucket,
          COUNT(*) as count
        FROM logs
        {clause}
        GROUP BY bucket
        ORDER BY bucket
    """
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute(sql, [bucket_minutes, bucket_minutes] + params)
        rows = cur.fetchall()
        return [{"bucket": r["bucket"], "count": r["count"]} for r in rows]
    finally:
        conn.close()

# -----------------------
# FastAPI Setup
# -----------------------
app = FastAPI(title="Secure Log Server (Realtime Dashboard)")

class LogEntry(BaseModel):
    event_type: str = Field(..., min_length=1, max_length=128)
    data: Any
    encrypted: str = Field(..., min_length=1)

def require_api_key(api_key: str = Depends(API_KEY_HEADER)):
    if api_key != API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API Key"
        )

# -----------------------
# Realtime WebSocket Hub
# -----------------------
class ConnectionManager:
    def __init__(self):
        self.active: set[WebSocket] = set()
        self.lock = threading.Lock()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        with self.lock:
            self.active.add(websocket)

    def disconnect(self, websocket: WebSocket):
        with self.lock:
            if websocket in self.active:
                self.active.remove(websocket)

    async def broadcast(self, message: dict):
        dead = []
        with self.lock:
            targets = list(self.active)
        for ws in targets:
            try:
                await ws.send_text(json.dumps(message))
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

manager = ConnectionManager()

# -----------------------
# Endpoints
# -----------------------
@app.post("/log")
async def receive_log(entry: LogEntry, _: str = Depends(require_api_key)):
    log_id = insert_log(entry.event_type, entry.data, entry.encrypted)
    await manager.broadcast({
        "type": "log",
        "payload": {
            "id": log_id,
            "event_type": entry.event_type,
            "data": entry.data,
            "created_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
        }
    })
    return {"status": "ok", "id": log_id}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)

@app.get("/api/logs")
async def api_logs(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    event_type: Optional[str] = None,
    q: Optional[str] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
):
    rows = get_logs(limit=limit, offset=offset, event_type=event_type, q=q, start=start, end=end)
    total = count_logs(event_type=event_type, q=q, start=start, end=end)
    items = [
        {
            "id": r["id"],
            "created_at": r["created_at"],
            "event_type": r["event_type"],
            "data": r["data"],
        } for r in rows
    ]
    return {"total": total, "items": items}

@app.get("/api/stats")
async def api_stats(
    event_type: Optional[str] = None,
    q: Optional[str] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
    bucket_minutes: int = Query(5, ge=1, le=1440),
):
    if not start and not end:
        end_dt = datetime.utcnow()
        start_dt = end_dt - timedelta(hours=24)
        start = start_dt.strftime("%Y-%m-%d %H:%M:%S")
        end = end_dt.strftime("%Y-%m-%d %H:%M:%S")

    hist = get_event_type_histogram(start, end)
    ts = get_timeseries(start, end, bucket_minutes=bucket_minutes, event_type=event_type, q=q)
    return {"histogram": hist, "timeseries": ts, "start": start, "end": end}

@app.get("/export.csv")
async def export_csv(
    event_type: Optional[str] = None,
    q: Optional[str] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
):
    def row_iter():
        yield "id,created_at,event_type,data\n"
        conn = get_conn()
        try:
            clause, params = build_filters(event_type, q, start, end)
            sql = f"""
                SELECT id, created_at, event_type, data
                FROM logs
                {clause}
                ORDER BY id DESC
            """
            cur = conn.cursor()
            for r in cur.execute(sql, params):
                def esc(s: str) -> str:
                    s = "" if s is None else str(s)
                    if any(ch in s for ch in [",", "\"", "\n", "\r"]):
                        s = "\"" + s.replace("\"", "\"\"") + "\""
                    return s
                yield f"{r['id']},{esc(r['created_at'])},{esc(r['event_type'])},{esc(r['data'])}\n"
        finally:
            conn.close()
    filename = f"logs_export_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return StreamingResponse(row_iter(), media_type="text/csv", headers=headers)

# -----------------------
# GUI (HTML)
# -----------------------

@app.get("/logs")
async def fetch_logs(limit: int = 50):
    logs = get_logs(limit)
    result = [
        {
            "event_type": row["event_type"],
            "data": row["data"],
            "encrypted": row["encrypted"] if "encrypted" in row else "",
            "created_at": row["created_at"],
        }
        for row in logs
    ]
    return JSONResponse(result)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIST = os.path.join(BASE_DIR, "frontend", "dist")
if os.path.exists(FRONTEND_DIST):
    # Serve React single-page app at /
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")


# -----------------------
# Entry Point
# -----------------------
if __name__ == "__main__":
    init_db()
    import uvicorn
    uvicorn.run("siem_server:app", host="0.0.0.0", port=8000, reload=False)
else:
    init_db()