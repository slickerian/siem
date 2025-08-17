import pyudev
import time
import yaml
import os
import threading
from utils.colors import color_text, RED, GREEN, YELLOW, CYAN, MAGENTA, RESET, BLUE

# Load whitelist from rules.yml
CONFIG_RULES = os.path.join(os.path.dirname(__file__), "..", "config", "rules.yml")

def load_whitelist():
    try:
        with open(CONFIG_RULES, "r") as f:
            data = yaml.safe_load(f) or {}
            return data.get("whitelisted_usb_serials", [])  # Add this in rules.yml
    except Exception:
        return []

def start(logger):
    print(color_text("[*] USB Monitor Started...", GREEN))
    context = pyudev.Context()
    monitor = pyudev.Monitor.from_netlink(context)
    monitor.filter_by(subsystem='usb')

    whitelisted_serials = load_whitelist()

    def monitor_loop():
        for device in iter(monitor.poll, None):
            try:
                serial = device.get("ID_SERIAL_SHORT")
                vendor = device.get("ID_VENDOR")
                model = device.get("ID_MODEL")

                if device.action == 'add':
                    if serial in whitelisted_serials:
                        logger.log("USB_INSERTED_WHITELISTED", {
                            "device_node": device.device_node,
                            "serial": serial,
                            "vendor": vendor,
                            "model": model,
                            "timestamp": time.time()
                        })
                        print(f"[EVENT] Whitelisted USB Inserted: {device.device_node}")
                    else:
                        logger.log("USB_INSERTED", {
                            "device_node": device.device_node,
                            "serial": serial,
                            "vendor": vendor,
                            "model": model,
                            "timestamp": time.time()
                        })
                        print(f"[EVENT] ALERT - Unknown USB Inserted: {device.device_node}")

                elif device.action == 'remove':
                    logger.log("USB_REMOVED", {
                        "device_node": device.device_node,
                        "timestamp": time.time()
                    })
                    print(f"[EVENT] USB Removed: {device.device_node}")

            except Exception as e:
                logger.log("USB_MONITOR_ERROR", {"error": str(e)})

    # Run in background thread
    thread = threading.Thread(target=monitor_loop, daemon=True)
    thread.start()
