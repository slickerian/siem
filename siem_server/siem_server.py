from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional
import sqlite3
import json
from datetime import datetime
import io
import csv

app = FastAPI()

# Allow frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # for dev; change later to frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_FILE = "siem.db"

# -----------------------------
# Database Helpers
# -----------------------------
def get_db():
    conn = sqlite3.connect(DB_FILE)
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
        return datetime.fromisoformat(value).isoformat()
    except ValueError:
        try:
            return datetime.strptime(value, "%Y-%m-%d %H:%M:%S").isoformat()
        except ValueError:
            raise ValueError(f"Invalid date format: {value}")

# -----------------------------
# WebSocket clients
# -----------------------------
active_connections: List[WebSocket] = []

# -----------------------------
# /log - ingestion from nodes
# -----------------------------
@app.post("/log")
async def ingest_log(log: LogIn):   # ✅ made async
    now = datetime.utcnow().isoformat()
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO logs (created_at, event_type, data) VALUES (?, ?, ?)",
        (now, log.event_type, log.data),
    )
    conn.commit()
    conn.close()

    payload = {"event_type": log.event_type, "data": log.data, "created_at": now}

    # Broadcast to WS clients
    for ws in list(active_connections):
        try:
            await ws.send_text(json.dumps(payload))   # ✅ await properly
        except:
            active_connections.remove(ws)

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
            await ws.receive_text()  # keep alive
    except WebSocketDisconnect:
        if ws in active_connections:
            active_connections.remove(ws)

# -----------------------------
# /api/logs - fetch logs
# -----------------------------
@app.get("/api/logs")
def get_logs(
    limit: int = Query(1000, ge=1, le=5000),
    offset: int = Query(0, ge=0),
    event_type: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    start: Optional[str] = Query(None),
    end: Optional[str] = Query(None),
):
    conn = get_db()
    cur = conn.cursor()

    query = "SELECT * FROM logs WHERE 1=1"
    params: List = []

    if event_type:
        query += " AND event_type = ?"
        params.append(event_type)
    if q:
        query += " AND data LIKE ?"
        params.append(f"%{q}%")
    if start:
        query += " AND created_at >= ?"
        params.append(parse_time(start))
    if end:
        query += " AND created_at <= ?"
        params.append(parse_time(end))

    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    rows = cur.execute(query, params).fetchall()
    total = cur.execute("SELECT COUNT(*) FROM logs").fetchone()[0]
    conn.close()

    return {
        "total": total,
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
    bucket_minutes: int = 60,
):
    conn = get_db()
    cur = conn.cursor()

    filters = "WHERE 1=1"
    params: List = []

    if event_type:
        filters += " AND event_type = ?"
        params.append(event_type)
    if q:
        filters += " AND data LIKE ?"
        params.append(f"%{q}%")
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
        SELECT strftime('%Y-%m-%d %H:%M:00', created_at) as bucket,
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
        "start": start,
        "end": end,
    }

# -----------------------------
# /export.csv - download logs
# -----------------------------
@app.get("/export.csv")
def export_logs():
    conn = get_db()
    cur = conn.cursor()
    rows = cur.execute("SELECT * FROM logs ORDER BY created_at DESC").fetchall()
    conn.close()

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=["id", "created_at", "event_type", "data"])
    writer.writeheader()
    for row in rows:
        writer.writerow(dict(row))

    response = StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
    )
    response.headers["Content-Disposition"] = "attachment; filename=logs.csv"
    return response
