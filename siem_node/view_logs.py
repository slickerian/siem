# view_logs.py
import os
import base64
from utils.encryption import decrypt_data

LOG_FILE = "logs/siem_logs.enc"
KEY_FILE = "logs/logging_key.bin"

def read_logs():
    if not os.path.exists(LOG_FILE) or not os.path.exists(KEY_FILE):
        print("[!] No logs or key found.")
        return

    with open(KEY_FILE, "rb") as kf:
        key = kf.read()

    with open(LOG_FILE, "r") as lf:
        lines = lf.readlines()

    print(f"\n[+] Decrypted Logs ({len(lines)} entries):\n")
    for line in lines:
        try:
            encrypted = base64.b64decode(line.strip())
            decrypted = decrypt_data(encrypted, key)
            print(decrypted.decode())
        except Exception as e:
            print(f"[!] Error decrypting a line: {e}")

if __name__ == "__main__":
    read_logs()
