import hashlib
import os
import time
import psutil
import yaml


# Config paths
PATHS_FILE = os.path.join(os.path.dirname(__file__), "..", "config", "paths.yml")

def load_protected_files():
    """Load the list of files to protect from paths.yml."""
    try:
        with open(PATHS_FILE, "r") as f:
            data = yaml.safe_load(f) or {}
            return data.get("protected_files", [])
    except Exception as e:
        print(f"[!] Failed to load protected files: {e}")
        return []  # Fail safe: no files to protect

initial_checksums = {}

def compute_sha256(file_path):
    """Compute SHA256 checksum of a file."""
    try:
        with open(file_path, "rb") as f:
            return hashlib.sha256(f.read()).hexdigest()
    except Exception:
        return None

def initialize_integrity(logger):
    """Create baseline checksums for all protected files."""
    global initial_checksums
    protected_files = load_protected_files()
    for f in protected_files:
        checksum = compute_sha256(f)
        if checksum:
            initial_checksums[f] = checksum
        else:
            logger.log("TAMPER_INIT_FAILED", {"file": f})
    logger.log("TAMPER_BASELINE_CREATED", {"files": list(initial_checksums.keys())})

def check_integrity(logger):
    """Verify that all protected files match their original checksums."""
    tampered = []
    for f, old_hash in initial_checksums.items():
        new_hash = compute_sha256(f)
        if new_hash != old_hash:
            tampered.append(f)
            logger.log("TAMPER_DETECTED", {"file": f})
    return tampered

def monitor_uptime(logger, start_time):
    """
    Check if system uptime is suspiciously low (possible reboot).
    Logs an alert if reboot suspected.
    """
    current_uptime = time.time() - start_time
    if current_uptime < 60:
        logger.log("TAMPER_REBOOT_SUSPECTED", {"uptime_seconds": current_uptime})
        return False
    return True

def check_background_running(logger, process_name="main.py"):
    """
    Checks if the siem agent is still running.
    Logs an event if it's unexpectedly stopped.
    """
    current_pid = os.getpid()
    found = False
    for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
        try:
            if proc.info['pid'] != current_pid and process_name in ' '.join(proc.info['cmdline']):
                found = True
                break
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            continue
    if not found:
        logger.log("TAMPER_BACKGROUND_STOPPED", {"process_name": process_name})
        return False
    return True

def start(logger):
    """
    Initializes tamper protection and periodically checks for issues.
    Runs in the background (daemon thread).
    """
    print("[*] Tamper Protection Started...")
    import threading
    start_time = time.time()
    initialize_integrity(logger)

    def monitor_loop():
        while True:
            tampered = check_integrity(logger)
            if tampered:
                logger.log("TAMPER_ALERT", {"files": tampered})

            monitor_uptime(logger, start_time)
            check_background_running(logger)
            time.sleep(30)  # Check every 30 seconds

    thread = threading.Thread(target=monitor_loop, daemon=True)
    thread.start()
