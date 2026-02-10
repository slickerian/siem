# core/logger.py
import os
import base64
import time
import requests   # <-- for sending logs to server
from utils.encryption import generate_key, encrypt_data, decrypt_data

BASE_DIR = os.path.dirname(os.path.abspath(__file__))   # /siem/siem_node/core
BASE_DIR = os.path.dirname(BASE_DIR)                   # /siem/siem_node
LOG_DIR = os.path.join(BASE_DIR, "logs")
LOG_FILE = os.path.join(LOG_DIR, "siem_logs.enc")
INCIDENT_LOG_FILE = os.path.join(LOG_DIR, "incidents.enc")
KEY_FILE = os.path.join(LOG_DIR, "logging_key.bin")

# ✅ Server endpoint and API key (configurable via env vars)
import os
SERVER_URL = os.getenv("SIEM_SERVER_URL", "http://100.119.19.5:8000/log")
SETTINGS_URL = os.getenv("SIEM_SETTINGS_URL", "http://100.119.19.5:8000/api/nodes/{}/settings")
API_KEY = os.getenv("SIEM_API_KEY", "secretkey")  # must match server config

# Each node identifies itself
NODE_ID = os.uname().nodename  # or any unique string per node

# Settings cache
settings_cache = {
    'enable_log_collection': True,
    'log_send_interval': 30,
    'last_fetched': 0
}

# Log buffer for batch sending
log_buffer = []
last_send_time = 0

class EncryptedLogger:
    def __init__(self):
        if not os.path.exists(LOG_DIR):
            os.makedirs(LOG_DIR)

        if not os.path.exists(KEY_FILE):
            key = generate_key()
            with open(KEY_FILE, 'wb') as kf:
                kf.write(key)
        else:
            with open(KEY_FILE, 'rb') as kf:
                key = kf.read()
        self.key = key

    def fetch_settings(self):
        """Fetch settings from server periodically"""
        global settings_cache
        now = time.time()
        if now - settings_cache['last_fetched'] < 10:  # Fetch every 30 seconds
            return

        try:
            response = requests.get(SETTINGS_URL.format(NODE_ID), timeout=5)
            if response.status_code == 200:
                data = response.json()
                old_enable = settings_cache['enable_log_collection']
                settings_cache.update({
                    'enable_log_collection': data.get('enable_log_collection', True),
                    'log_send_interval': data.get('log_send_interval', 30),
                    'last_fetched': now
                })
                if old_enable != settings_cache['enable_log_collection']:
                    print(f"[Logger] Log collection {'enabled' if settings_cache['enable_log_collection'] else 'disabled'}")
                    if not settings_cache['enable_log_collection']:
                        # Clear buffer when disabled
                        log_buffer.clear()
                        print("[Logger] Cleared log buffer")
                print(f"[Logger] Settings updated: enable={settings_cache['enable_log_collection']}, interval={settings_cache['log_send_interval']}")
            else:
                print(f"[Logger] Settings fetch failed: HTTP {response.status_code}")
        except Exception as e:
            print(f"[Logger] Could not fetch settings: {e}")

    def send_heartbeat(self):
        """Send a heartbeat log to keep node online"""
        try:
            requests.post(
                SERVER_URL,
                json={
                    "node_id": NODE_ID,
                    "event_type": "HEARTBEAT",
                    "data": "Node is alive",
                },
                headers={"X-API-Key": API_KEY},
                timeout=3
            )
        except Exception as e:
            print(f"[Logger] Heartbeat failed: {e}")

    def log(self, event_type, data):
        """Normal encrypted log entry + send to server."""
        self._write_encrypted(LOG_FILE, event_type, data)

    def log_incident(self, event_type, data):
        """Incident log entry + send to server."""
        self._write_encrypted(INCIDENT_LOG_FILE, event_type, data)

    def _write_encrypted(self, file_path, event_type, data):
        log_entry = f"{time.ctime()} | {event_type} | {data}".encode('utf-8')
        encrypted = encrypt_data(log_entry, self.key)

        # save locally
        with open(file_path, 'a') as lf:
            lf.write(base64.b64encode(encrypted).decode() + "\n")

        # Fetch settings if needed
        self.fetch_settings()

        # Buffer log for sending
        if settings_cache['enable_log_collection']:
            log_buffer.append({
                "node_id": NODE_ID,
                "event_type": str(event_type),
                "data": str(data),
                "encrypted": base64.b64encode(encrypted).decode()
            })
            self._send_buffered_logs_if_needed()
        else:
            print(f"[Logger] Log collection disabled, skipping buffer for {event_type}")

    def _send_buffered_logs_if_needed(self):
        """Send buffered logs if interval has passed"""
        global last_send_time, log_buffer
        now = time.time()
        if now - last_send_time >= settings_cache['log_send_interval'] and log_buffer:
            try:
                # Send all buffered logs
                for log_data in log_buffer:
                    requests.post(SERVER_URL, json=log_data, headers={"X-API-Key": API_KEY}, timeout=3)
                print(f"[Logger] Sent {len(log_buffer)} buffered logs")
                log_buffer.clear()
                last_send_time = now
            except Exception as e:
                print(f"[Logger Warning] Could not send buffered logs: {e}")

    def get_recent_events(self, limit=50, incidents=False):
        """Fetch last N decrypted events (normal by default)."""
        target_file = INCIDENT_LOG_FILE if incidents else LOG_FILE
        if not os.path.exists(target_file):
            return []
        with open(target_file, 'r') as lf:
            lines = lf.readlines()[-limit:]
        events = []
        for line in lines:
            try:
                encrypted = base64.b64decode(line.strip())
                decrypted = decrypt_data(encrypted, self.key)
                events.append(decrypted.decode())
            except Exception:
                continue
        return events
