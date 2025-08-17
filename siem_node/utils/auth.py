import hashlib
import yaml
import os

AUTH_FILE = os.path.join(os.path.dirname(__file__), "..", "config", "auth.yml")

def verify_admin_password(input_password):
    try:
        with open(AUTH_FILE, "r") as f:
            data = yaml.safe_load(f) or {}
            stored_hash = data.get("admin_password_hash", "")
            input_hash = hashlib.sha256(input_password.encode()).hexdigest()
            return input_hash == stored_hash
    except:
        return False
