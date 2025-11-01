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

# ✅ Server endpoint and API key
SERVER_URL = "http://192.168.1.6:8000/log"
API_KEY = "secretkey"  # must match server config

# Each node identifies itself
NODE_ID = os.uname().nodename  # or any unique string per node

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

        # also send to server
        try:
            requests.post(
                SERVER_URL,
                json={
                    "node_id": NODE_ID,
                    "event_type": str(event_type),
                    "data": str(data),
                    "encrypted": base64.b64encode(encrypted).decode()
                },
                headers={"X-API-Key": API_KEY},
                timeout=3
            )
        except Exception as e:
            print(f"[Logger Warning] Could not send log to server: {e}")

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
