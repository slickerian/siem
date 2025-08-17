import os
import subprocess

def execute(action, event_data=None, logger=None):
    """
    Executes a security response based on the triggered action.
    Logs the result (success/failure) using the encrypted logger.
    """
    if action == "block_usb":
        block_usb(logger)
    elif action == "logoff_user":
        logoff_user(logger)
    elif action == "lock_terminal":
        lock_terminal(logger)
    elif action == "kill_process":
        pid = event_data.get("pid") if event_data else None
        if pid:
            kill_process(pid, logger)
        else:
            if logger:
                logger.log("ACTION_FAILED", {"action": "kill_process", "reason": "PID not provided"})
    else:
        if logger:
            logger.log("ACTION_UNKNOWN", {"action": action})
        print(f"[!] Unknown action: {action}")

def block_usb(logger=None):
    try:
        subprocess.run(["modprobe", "-r", "usb_storage"], check=True)
        if logger:
            logger.log("ACTION_TAKEN", {"action": "block_usb"})
        print("[+] USB storage module removed (USB blocked).")
    except subprocess.CalledProcessError as e:
        if logger:
            logger.log("ACTION_FAILED", {"action": "block_usb", "error": str(e)})

def logoff_user(logger=None):
    try:
        subprocess.run(["pkill", "-KILL", "-u", os.getlogin()], check=True)
        if logger:
            logger.log("ACTION_TAKEN", {"action": "logoff_user"})
        print("[+] User forcibly logged off.")
    except Exception as e:
        if logger:
            logger.log("ACTION_FAILED", {"action": "logoff_user", "error": str(e)})

def lock_terminal(logger=None):
    try:
        subprocess.run(["loginctl", "lock-session"], check=True)
        if logger:
            logger.log("ACTION_TAKEN", {"action": "lock_terminal"})
        print("[+] Terminal session locked.")
    except Exception as e:
        if logger:
            logger.log("ACTION_FAILED", {"action": "lock_terminal", "error": str(e)})

def kill_process(pid, logger=None):
    try:
        os.kill(int(pid), 9)
        if logger:
            logger.log("ACTION_TAKEN", {"action": "kill_process", "pid": pid})
        print(f"[+] Process {pid} killed.")
    except Exception as e:
        if logger:
            logger.log("ACTION_FAILED", {"action": "kill_process", "pid": pid, "error": str(e)})
