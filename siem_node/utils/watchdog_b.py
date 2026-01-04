# utils/watchdog_b.py

import os
import time
import subprocess

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAIN_PID_FILE = "/tmp/insider_main.pid"
A_PID_FILE = "/tmp/watchdog_a.pid"

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
    script_path = os.path.join(BASE_DIR, script_name)
    subprocess.Popen(["python3", script_path])

def main():
    with open("/tmp/watchdog_b.pid", "w") as f:
        f.write(str(os.getpid()))

    while True:
        main_pid = get_pid_from_file(MAIN_PID_FILE)
        a_pid = get_pid_from_file(A_PID_FILE)

        if not is_alive(main_pid):
            restart_process("main.py")

        if not is_alive(a_pid):
            restart_process("utils/watchdog_a.py")

        time.sleep(10)

if __name__ == "__main__":
    main()
