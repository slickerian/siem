import psutil
import time
import yaml
import os


CONFIG_RULES = os.path.join(os.path.dirname(__file__), "..", "config", "rules.yml")

def load_rules():
    try:
        with open(CONFIG_RULES, "r") as f:
            return yaml.safe_load(f) or {}
    except:
        return {}

def start(logger, interval=5):
    print("[*] Command Monitor Started...")
    rules = load_rules()
    suspicious_bins = rules.get("suspicious_binaries", [])
    safe_processes = rules.get("safe_processes", [])
    seen_pids = set()

    while True:
        for proc in psutil.process_iter(['pid', 'name', 'exe', 'cmdline']):
            try:
                if proc.info['pid'] not in seen_pids:
                    seen_pids.add(proc.info['pid'])
                    cmdline = " ".join(proc.info['cmdline']) if proc.info['cmdline'] else ""
                    binary = proc.info['name'] or ""

                    # Check suspicious binaries
                    if any(s in cmdline for s in suspicious_bins) or binary in suspicious_bins:
                        # Skip whitelisted/safe processes
                        if not any(safe in cmdline for safe in safe_processes):
                            logger.log("SUSPICIOUS_COMMAND", {
                                "pid": proc.info['pid'],
                                "binary": binary,
                                "cmdline": cmdline,
                                "timestamp": time.time()
                            })
                            print(f"[EVENT] Suspicious command detected: {cmdline}")
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        time.sleep(interval)
