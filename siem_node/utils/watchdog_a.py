# utils/watchdog_a.py

import os
import time
import subprocess

MAIN_PID_FILE = "/tmp/siem_main.pid"
B_PID_FILE = "/tmp/watchdog_b.pid"

def get_pid_from_file(pid_file):
    try:
        with open(pid_file, "r") as f:
            return int(f.read().strip())
    except:
        return None

def is_alive(pid):
    return pid and os.path.exists(f"/proc/{pid}")

def restart_process(script_name):
    print(f"[!] Restarting {script_name}")
    subprocess.Popen(["/usr/bin/python3", f"/home/mechanic/siem/{script_name}"])

def main():
    with open("/tmp/watchdog_a.pid", "w") as f:
        f.write(str(os.getpid()))

    while True:
        main_pid = get_pid_from_file(MAIN_PID_FILE)
        b_pid = get_pid_from_file(B_PID_FILE)

        if not is_alive(main_pid):
            restart_process("main.py")

        if not is_alive(b_pid):
            restart_process("utils/watchdog_b.py")

        time.sleep(10)

if __name__ == "__main__":
    main()
