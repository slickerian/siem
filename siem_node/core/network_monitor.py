import time
import threading
import psutil
import yaml
import os


CONFIG_RULES = os.path.join(os.path.dirname(__file__), "..", "config", "rules.yml")

def load_network_rules():
    """Load network whitelist rules from YAML (rules.yml)."""
    try:
        with open(CONFIG_RULES, "r") as f:
            data = yaml.safe_load(f) or {}
            whitelist_ips = data.get("white_list_ips", [])
            whitelist_ports = data.get("white_list_ports", [])
            return set(whitelist_ips), set(whitelist_ports)
    except:
        return set(), set()

def snapshot_connections():
    """Take a snapshot of active network connections."""
    conns = []
    for conn in psutil.net_connections(kind="inet"):
        if conn.raddr:  # only remote connections
            conns.append({
                "laddr": f"{conn.laddr.ip}:{conn.laddr.port}" if conn.laddr else None,
                "raddr": f"{conn.raddr.ip}:{conn.raddr.port}" if conn.raddr else None,
                "pid": conn.pid,
                "status": conn.status
            })
    return conns

def diff_connections(prev, curr, whitelist_ips, whitelist_ports, logger):
    """Compare previous vs current connections and log changes."""
    prev_set = { (c["laddr"], c["raddr"], c["pid"], c["status"]) for c in prev }
    curr_set = { (c["laddr"], c["raddr"], c["pid"], c["status"]) for c in curr }

    new_conns = curr_set - prev_set
    closed_conns = prev_set - curr_set

    for laddr, raddr, pid, status in new_conns:
        if raddr:
            ip, port = raddr.split(":")
            if ip in whitelist_ips or port in whitelist_ports:
                continue
        logger.log("NET_CONNECT", {
            "local": laddr, "remote": raddr, "pid": pid, "status": status, "timestamp": time.time()
        })
        print(f"[NET] New connection {laddr} -> {raddr} (PID {pid})")

    for laddr, raddr, pid, status in closed_conns:
        if raddr:
            ip, port = raddr.split(":")
            if ip in whitelist_ips or port in whitelist_ports:
                continue
        logger.log("NET_DISCONNECT", {
            "local": laddr, "remote": raddr, "pid": pid, "status": status, "timestamp": time.time()
        })
        print(f"[NET] Closed connection {laddr} -> {raddr} (PID {pid})")

def start(logger, interval=2):
    print("[*] Network Monitor Started...")
    whitelist_ips, whitelist_ports = load_network_rules()

    prev = snapshot_connections()

    def monitor_loop():
        nonlocal prev
        while True:
            curr = snapshot_connections()
            diff_connections(prev, curr, whitelist_ips, whitelist_ports, logger)
            prev = curr
            time.sleep(interval)

    thread = threading.Thread(target=monitor_loop, daemon=True)
    thread.start()
