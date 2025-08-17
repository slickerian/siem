# core/logger.py 
import os
import base64
import time
from utils.encryption import generate_key, encrypt_data, decrypt_data

LOG_DIR = "logs"
LOG_FILE = os.path.join(LOG_DIR, "siem_logs.enc")
INCIDENT_LOG_FILE = os.path.join(LOG_DIR, "incidents.enc")  # <-- New file for incidents
KEY_FILE = os.path.join(LOG_DIR, "logging_key.bin")

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
        """Normal encrypted log entry (unchanged)."""
        self._write_encrypted(LOG_FILE, event_type, data)

    def log_incident(self, event_type, data):
        """Separate encrypted log entry for serious incidents."""
        self._write_encrypted(INCIDENT_LOG_FILE, event_type, data)

    def _write_encrypted(self, file_path, event_type, data):
        log_entry = f"{time.ctime()} | {event_type} | {data}".encode('utf-8')
        encrypted = encrypt_data(log_entry, self.key)
        with open(file_path, 'a') as lf:
            lf.write(base64.b64encode(encrypted).decode() + "\n")

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
