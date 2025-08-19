# siem_server.py
from __future__ import annotations

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
DASHBOARD_HTML = """
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Log Dashboard</title>
    <!-- Tailwind CSS -->
    <script src="https://cdn.tailwindcss.com"></script>
    <!-- DataTables -->
    <link href="https://cdn.datatables.net/v/bs5/dt-2.0.8/datatables.min.css" rel="stylesheet"/>
    <!-- Flatpickr -->
    <link href="https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css" rel="stylesheet">
    <style>
      .badge-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; }
      .badge-info { background: #3b82f6; }
      .badge-warn { background: #f59e0b; }
      .badge-err { background: #ef4444; }
      .sticky { position: sticky; top: 0; background: white; z-index: 10; }
      .monospace { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
      .table-wrap { max-height: 60vh; overflow-y: auto; }
    </style>
  </head>
  <body class="bg-gray-100 text-gray-800">
    <div class="container mx-auto p-4 sm:p-6">
      <header class="flex justify-between items-center mb-6">
        <h1 class="text-2xl sm:text-3xl font-bold text-gray-900">📊 Realtime Log Dashboard</h1>
        <div class="flex gap-2">
          <a id="exportLink" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition">Export CSV</a>
          <button id="pauseBtn" class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition">Pause Stream</button>
          <button id="clearBtn" class="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition">Clear Table</button>
        </div>
      </header>

      <!-- Filters -->
      <div class="bg-white shadow-lg rounded-lg p-4 sm:p-6 mb-6">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Event Type</label>
            <input type="text" id="eventType" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="e.g. INFO/WARN/ERROR">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <input type="text" id="searchQ" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="keyword in event/data">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Start</label>
            <input type="text" id="start" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="YYYY-MM-DD HH:MM:SS">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">End</label>
            <input type="text" id="end" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="YYYY-MM-DD HH:MM:SS">
          </div>
        </div>
        <div class="mt-4 flex gap-2">
          <button id="applyBtn" class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition">Apply Filters</button>
          <button id="resetBtn" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition">Reset</button>
        </div>
      </div>

      <!-- Charts -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div class="bg-white shadow-lg rounded-lg p-4 sm:p-6">
          <h2 class="text-lg font-semibold text-gray-900 mb-4">Event Types (Count)</h2>
          <canvas id="histChart" class="w-full" height="140"></canvas>
        </div>
        <div class="bg-white shadow-lg rounded-lg p-4 sm:p-6">
          <div class="flex justify-between items-center mb-4">
            <h2 class="text-lg font-semibold text-gray-900">Events Over Time</h2>
            <div class="flex items-center gap-2">
              <label class="text-sm font-medium text-gray-700">Bucket (min)</label>
              <input type="number" id="bucket" class="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" value="5" min="1" max="1440">
            </div>
          </div>
          <canvas id="tsChart" class="w-full" height="140"></canvas>
        </div>
      </div>

      <!-- Table -->
      <div class="bg-white shadow-lg rounded-lg p-4 sm:p-6">
        <div class="table-wrap">
          <table id="logTable" class="w-full table-auto">
            <thead class="sticky">
              <tr class="bg-gray-800 text-white">
                <th class="px-4 py-2">ID</th>
                <th class="px-4 py-2">Time</th>
                <th class="px-4 py-2">Event Type</th>
                <th class="px-4 py-2">Data</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
        <p class="mt-2 text-sm text-gray-500">Note: encrypted/hash column is securely stored but intentionally hidden.</p>
      </div>
    </div>

    <!-- Vendor scripts -->
    <script src="https://cdn.jsdelivr.net/npm/flatpickr"></script>
    <script src="https://cdn.datatables.net/v/bs5/dt-2.0.8/datatables.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

    <script>
      // Helpers
      function toQuery(params) {
        const usp = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => {
          if (v !== undefined && v !== null && String(v).trim() !== '') usp.set(k, v);
        });
        return usp.toString();
      }
      function encodeText(text) {
        const div = document.createElement('div');
        div.innerText = text ?? '';
        return div.innerHTML;
      }
      function badgeForEvent(ev) {
        const e = String(ev || '').toUpperCase();
        let cls = 'badge-info';
        if (e.includes('WARN')) cls = 'badge-warn';
        if (e.includes('ERR') || e.includes('FAIL')) cls = 'badge-err';
        return `<span class="badge-dot ${cls}"></span>` + encodeText(ev);
      }

      // Filters
      const eventTypeEl = document.getElementById('eventType');
      const searchQEl = document.getElementById('searchQ');
      const startEl = document.getElementById('start');
      const endEl = document.getElementById('end');
      const bucketEl = document.getElementById('bucket');
      flatpickr(startEl, { enableTime: true, dateFormat: "Y-m-d H:i:S" });
      flatpickr(endEl,   { enableTime: true, dateFormat: "Y-m-d H:i:S" });

      // DataTable
      let dt = new DataTable('#logTable', {
        paging: true,
        pageLength: 25,
        searching: false,
        order: [[0, 'desc']],
        columns: [
          { data: 'id', width: '80px' },
          { data: 'created_at', width: '180px', className: 'monospace' },
          { data: 'event_type', render: (d)=> badgeForEvent(d), width: '160px' },
          { data: 'data', render: (d)=> `<span class="monospace">${encodeText(d)}</span>` },
        ]
      });

      // Export link
      function refreshExportLink() {
        const q = toQuery({
          event_type: eventTypeEl.value,
          q: searchQEl.value,
          start: startEl.value,
          end: endEl.value
        });
        document.getElementById('exportLink').href = '/export.csv' + (q ? ('?' + q) : '');
      }

      // Load initial table data with filters
      async function loadTable(pageOffset=0) {
        const params = {
          limit: 250,
          offset: pageOffset,
          event_type: eventTypeEl.value,
          q: searchQEl.value,
          start: startEl.value,
          end: endEl.value
        };
        const res = await fetch('/api/logs?' + toQuery(params));
        const json = await res.json();
        dt.clear();
        dt.rows.add(json.items);
        dt.draw();
        refreshExportLink();
      }

      // Charts
      const histCtx = document.getElementById('histChart');
      const tsCtx = document.getElementById('tsChart');
      let histChart = new Chart(histCtx, {
        type: 'bar',
        data: {
          labels: [],
          datasets: [{
            label: 'Count',
            data: [],
            backgroundColor: '#3b82f6',
            borderColor: '#2563eb',
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: { beginAtZero: true }
          }
        }
      });
      let tsChart = new Chart(tsCtx, {
        type: 'line',
        data: {
          labels: [],
          datasets: [{
            label: 'Events',
            data: [],
            tension: 0.3,
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.2)',
            fill: true
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: { beginAtZero: true }
          }
        }
      });

      async function loadStats() {
        const params = {
          event_type: eventTypeEl.value,
          q: searchQEl.value,
          start: startEl.value,
          end: endEl.value,
          bucket_minutes: bucketEl.value || 5
        };
        const res = await fetch('/api/stats?' + toQuery(params));
        const json = await res.json();

        // histogram
        histChart.data.labels = json.histogram.map(h => h.event_type ?? '(none)');
        histChart.data.datasets[0].data = json.histogram.map(h => h.count);
        histChart.update();

        // timeseries
        tsChart.data.labels = json.timeseries.map(t => t.bucket);
        tsChart.data.datasets[0].data = json.timeseries.map(t => t.count);
        tsChart.update();
      }

      // Realtime WebSocket
      let paused = false;
      const pauseBtn = document.getElementById('pauseBtn');
      pauseBtn.addEventListener('click', ()=>{
        paused = !paused;
        pauseBtn.textContent = paused ? 'Resume Stream' : 'Pause Stream';
      });
      document.getElementById('clearBtn').addEventListener('click', ()=>{
        dt.clear(); dt.draw();
      });

      function connectWS() {
        const proto = location.protocol === 'https:' ? 'wss' : 'ws';
        const ws = new WebSocket(proto + '://' + location.host + '/ws');
        ws.onmessage = (ev) => {
          if (paused) return;
          const msg = JSON.parse(ev.data);
          if (msg.type === 'log') {
            dt.rows.add([msg.payload]);
            dt.order([0, 'desc']).draw(false);
          }
        };
        ws.onclose = ()=> setTimeout(connectWS, 2000);
        ws.onerror = ()=> ws.close();
      }

      // Filter actions
      document.getElementById('applyBtn').addEventListener('click', async ()=>{
        await loadTable(0);
        await loadStats();
      });
      document.getElementById('resetBtn').addEventListener('click', async ()=>{
        eventTypeEl.value = '';
        searchQEl.value = '';
        startEl.value = '';
        endEl.value = '';
        bucketEl.value = 5;
        await loadTable(0);
        await loadStats();
      });

      // Auto refresh stats every 10s
      setInterval(loadStats, 10000);

      // Initial load
      (async ()=>{
        await loadTable(0);
        await loadStats();
        connectWS();
        refreshExportLink();
      })();
    </script>
  </body>
</html>
"""

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

@app.get("/gui", response_class=HTMLResponse)
async def show_logs():
    html = """
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Real-Time Log Dashboard</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          pre {
            white-space: pre-wrap;
            word-break: break-word;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
          }
        </style>
      </head>
      <body class="bg-gray-100 text-gray-800">
        <header class="bg-gray-800 text-white p-4 sm:p-6 flex justify-between items-center">
          <h1 class="text-xl sm:text-2xl font-bold">🔍 Real-Time Log Dashboard</h1>
        </header>

        <div class="container mx-auto p-4 sm:p-6">
          <div class="flex flex-col sm:flex-row gap-4 mb-6 bg-white shadow-lg rounded-lg p-4">
            <div class="flex-1">
              <label class="block text-sm font-medium text-gray-700 mb-1">Search Logs</label>
              <input type="text" id="searchBox" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="Search logs...">
            </div>
            <div class="flex-1">
              <label class="block text-sm font-medium text-gray-700 mb-1">Event Type</label>
              <select id="eventFilter" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                <option value="">All Events</option>
                <option value="NET_CONNECT">NET_CONNECT</option>
                <option value="NET_DISCONNECT">NET_DISCONNECT</option>
                <option value="AUTH">AUTH</option>
                <option value="ERROR">ERROR</option>
              </select>
            </div>
            <div class="flex-1">
              <label class="block text-sm font-medium text-gray-700 mb-1">Time Range</label>
              <select id="timeFilter" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                <option value="all">Any Time</option>
                <option value="1m">Last 1 min</option>
                <option value="5m">Last 5 min</option>
                <option value="1h">Last 1 hour</option>
              </select>
            </div>
          </div>

          <div class="bg-white shadow-lg rounded-lg overflow-hidden">
            <div class="overflow-x-auto">
              <table id="logTable" class="w-full table-auto">
                <thead class="bg-gray-800 text-white">
                  <tr>
                    <th class="px-4 py-2 text-left">Time</th>
                    <th class="px-4 py-2 text-left">Event Type</th>
                    <th class="px-4 py-2 text-left">Data</th>
                    <th class="px-4 py-2 text-left">Encrypted</th>
                  </tr>
                </thead>
                <tbody></tbody>
              </table>
            </div>
          </div>
        </div>

        <script>
          async function fetchLogs() {
            try {
              let res = await fetch('/logs');
              let logs = await res.json();

              // apply filters
              let search = document.getElementById('searchBox').value.toLowerCase();
              let eventType = document.getElementById('eventFilter').value;
              let timeRange = document.getElementById('timeFilter').value;
              let now = Date.now();

              logs = logs.filter(log => {
                if (search && !(
                  log.event_type.toLowerCase().includes(search) ||
                  log.data.toLowerCase().includes(search) ||
                  log.encrypted.toLowerCase().includes(search)
                )) {
                  return false;
                }

                if (eventType && log.event_type !== eventType) {
                  return false;
                }

                if (timeRange !== "all") {
                  let logTime = new Date(log.created_at).getTime();
                  let diff = (now - logTime) / 1000;
                  if (timeRange === "1m" && diff > 60) return false;
                  if (timeRange === "5m" && diff > 300) return false;
                  if (timeRange === "1h" && diff > 3600) return false;
                }

                return true;
              });

              let tbody = document.querySelector('#logTable tbody');
              tbody.innerHTML = '';
              for (let log of logs) {
                let row = document.createElement('tr');
                row.className = 'hover:bg-gray-50';
                row.innerHTML = `
                  <td class="px-4 py-2">${log.created_at}</td>
                  <td class="px-4 py-2">${log.event_type}</td>
                  <td class="px-4 py-2"><pre class="bg-gray-100 p-2 rounded">${log.data}</pre></td>
                  <td class="px-4 py-2">${log.encrypted}</td>
                `;
                tbody.appendChild(row);
              }
            } catch (err) {
              console.error('Error fetching logs:', err);
            }
          }
          setInterval(fetchLogs, 3000);
          fetchLogs();

          document.getElementById('searchBox').addEventListener('input', fetchLogs);
          document.getElementById('eventFilter').addEventListener('change', fetchLogs);
          document.getElementById('timeFilter').addEventListener('change', fetchLogs);
        </script>
      </body>
    </html>
    """
    return HTMLResponse(html)

# -----------------------
# Entry Point
# -----------------------
if __name__ == "__main__":
    init_db()
    import uvicorn
    uvicorn.run("siem_server:app", host="0.0.0.0", port=8000, reload=False)
else:
    init_db()