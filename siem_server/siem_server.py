from fastapi import FastAPI, Request, Depends, HTTPException, status
from fastapi.responses import HTMLResponse
from fastapi.security import APIKeyHeader
from pydantic import BaseModel
import sqlite3
import uvicorn
import os

# -----------------------
# Config
# -----------------------
API_KEY = os.getenv("LOG_SERVER_KEY", "supersecretkey")  # set as env var in production
API_KEY_HEADER = APIKeyHeader(name="X-API-Key", auto_error=True)

DB_FILE = "logs.db"

# -----------------------
# Database Setup
# -----------------------
def init_db():
    conn = sqlite3.connect(DB_FILE)
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
    conn.commit()
    conn.close()

def insert_log(event_type, data, encrypted):
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("INSERT INTO logs (event_type, data, encrypted) VALUES (?, ?, ?)",
              (event_type, data, encrypted))
    conn.commit()
    conn.close()

def get_logs(limit=50):
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("SELECT event_type, data, encrypted, created_at FROM logs ORDER BY id DESC LIMIT ?", (limit,))
    rows = c.fetchall()
    conn.close()
    return rows

# -----------------------
# FastAPI Setup
# -----------------------
app = FastAPI(title="Secure Log Server")

class LogEntry(BaseModel):
    event_type: str
    data: str
    encrypted: str

# API Key Dependency
def require_api_key(api_key: str = Depends(API_KEY_HEADER)):
    if api_key != API_KEY:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API Key")

# -----------------------
# Endpoints
# -----------------------
@app.post("/log")
async def receive_log(entry: LogEntry, _: str = Depends(require_api_key)):
    insert_log(entry.event_type, entry.data, entry.encrypted)
    return {"status": "ok"}

@app.get("/gui", response_class=HTMLResponse)
async def show_logs():
    logs = get_logs()
    html = """
    <html>
        <head>
            <title>Log Viewer</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                table { border-collapse: collapse; width: 100%; }
                th, td { border: 1px solid #ddd; padding: 8px; }
                th { background-color: #f2f2f2; }
            </style>
        </head>
        <body>
            <h2>Collected Logs</h2>
            <table>
                <tr><th>Time</th><th>Event Type</th><th>Data</th><th>Encrypted</th></tr>
    """
    for event_type, data, encrypted, created_at in logs:
        html += f"<tr><td>{created_at}</td><td>{event_type}</td><td>{data}</td><td>{encrypted}</td></tr>"
    html += """
            </table>
        </body>
    </html>
    """
    return html

# -----------------------
# Entry Point
# -----------------------
if __name__ == "__main__":
    init_db()
    uvicorn.run("siem_server:app", host="0.0.0.0", port=8000, reload=False)
