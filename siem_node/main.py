import os
import time
import threading
import subprocess
from core import usb_monitor, file_watcher, command_monitor, policy_engine, tamper_protection, response_actions, network_monitor
from core.logger import EncryptedLogger
from utils.fingerprint import generate_device_fingerprint
from utils.system_info import collect_all_system_info as collect_system_info
from utils.colors import color_text, RED, GREEN, YELLOW, CYAN, MAGENTA, BLUE

SERVICE_NAME = "siem"
SHUTDOWN_FLAG = "/tmp/insider_shutdown.flag"


def start_monitor(module, name, logger, color=CYAN):
    def run():
        module.start(logger)
    threading.Thread(target=run, daemon=True).start()
    print(color_text(f"[*] {name} Monitor Started", color))


def main():
    os.makedirs("logs", exist_ok=True)
    logger = EncryptedLogger()

    # Log system fingerprint and info
    fingerprint = generate_device_fingerprint()
    system_info = collect_system_info()
    logger.log("SYSTEM_STARTUP", {"fingerprint": fingerprint, "system_info": system_info})

    with open("/tmp/insider_main.pid", "w") as f:
        f.write(str(os.getpid()))

    print(color_text("[*] SIEM CLI Agent Starting...", CYAN))

    # Start monitors
    start_monitor(usb_monitor, "USB", logger, GREEN)
    start_monitor(file_watcher, "File", logger, MAGENTA)
    start_monitor(command_monitor, "Command", logger, CYAN)
    start_monitor(tamper_protection, "Tamper", logger, YELLOW)
    start_monitor(network_monitor, "Network", logger, BLUE)   # <-- NEW

    try:
        logger.log("MONITORING_STARTED", {})

        while True:
            # Shutdown mechanism
            if os.path.exists(SHUTDOWN_FLAG):
                os.remove(SHUTDOWN_FLAG)
                logger.log("SYSTEM_SHUTDOWN", {"reason": "Authorized via shutdown flag"})
                print(color_text("[✓] Shutdown flag detected. Stopping service...", GREEN))
                subprocess.run(["systemctl", "stop", SERVICE_NAME])
                break

            # Collect events + evaluate policies
            events = logger.get_recent_events()
            decisions = policy_engine.evaluate(events, logger)

            for event in events:
                if "POLICY_TRIGGER" in event or "ALERT" in event:
                    print(color_text(f"[ALERT] {event.strip()}", YELLOW))
                elif "ERROR" in event or "FATAL" in event:
                    print(color_text(f"[ERROR] {event.strip()}", RED))
                else:
                    print(color_text(f"[EVENT] {event.strip()}", MAGENTA))

            for action, data in decisions:
                print(color_text(f"[ACTION] Executing {action} for {data}", BLUE))
                response_actions.execute(action, data, logger)

            time.sleep(5)

    except Exception as e:
        logger.log("FATAL_ERROR", {"exception": str(e)})
        print(color_text(f"[FATAL] {str(e)}", RED))
        raise


if __name__ == "__main__":
    main()
