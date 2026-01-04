import os
import time
import threading
import subprocess
from core import usb_monitor, file_watcher, command_monitor, policy_engine, tamper_protection, response_actions, network_monitor
from core.logger import EncryptedLogger
from utils.fingerprint import generate_device_fingerprint
from utils.system_info import collect_all_system_info as collect_system_info


SERVICE_NAME = "siem"
SHUTDOWN_FLAG = "/tmp/insider_shutdown.flag"


def start_monitor(module, name, logger):
    def run():
        module.start(logger)
    threading.Thread(target=run, daemon=True).start()
    print(f"[*] {name} Monitor Started")


def main():
    os.makedirs("logs", exist_ok=True)
    logger = EncryptedLogger()

    # Log system fingerprint and info
    fingerprint = generate_device_fingerprint()
    system_info = collect_system_info()
    logger.log("SYSTEM_STARTUP", {"fingerprint": fingerprint, "system_info": system_info})

    with open("/tmp/insider_main.pid", "w") as f:
        f.write(str(os.getpid()))

    print("[*] SIEM CLI Agent Starting...")

    # Fetch initial settings
    logger.fetch_settings()

    # Start monitors
    start_monitor(usb_monitor, "USB", logger)
    start_monitor(file_watcher, "File", logger)
    start_monitor(command_monitor, "Command", logger)
    start_monitor(tamper_protection, "Tamper", logger)
    start_monitor(network_monitor, "Network", logger)

    try:
        logger.log("MONITORING_STARTED", {})
        heartbeat_counter = 0

        while True:
            # Shutdown mechanism
            if os.path.exists(SHUTDOWN_FLAG):
                os.remove(SHUTDOWN_FLAG)
                logger.log("SYSTEM_SHUTDOWN", {"reason": "Authorized via shutdown flag"})
                print("[✓] Shutdown flag detected. Stopping service...")
                # In container, just break the loop; systemd not available
                break

            # Fetch settings periodically
            logger.fetch_settings()

            # Send heartbeat every 5 seconds to keep node online
            logger.send_heartbeat()

            # Collect events + evaluate policies
            events = logger.get_recent_events()
            decisions = policy_engine.evaluate(events, logger)

            for event in events:
                if "POLICY_TRIGGER" in event or "ALERT" in event:
                    print(f"[ALERT] {event.strip()}")
                elif "ERROR" in event or "FATAL" in event:
                    print(f"[ERROR] {event.strip()}")
                else:
                    print(f"[EVENT] {event.strip()}")

            for action, data in decisions:
                print(f"[ACTION] Executing {action} for {data}")
                response_actions.execute(action, data, logger)

            time.sleep(5)

    except Exception as e:
        logger.log("FATAL_ERROR", {"exception": str(e)})
        print(f"[FATAL] {str(e)}")
        raise


if __name__ == "__main__":
    main()
