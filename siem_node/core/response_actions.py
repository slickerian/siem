import os
import subprocess
import yaml

CONFIG_ACTIONS = os.path.join(os.path.dirname(__file__), "..", "config", "response_actions.yml")

def load_actions():
    try:
        with open(CONFIG_ACTIONS, "r") as f:
            data = yaml.safe_load(f) or {}
            return data.get("actions", {})
    except Exception as e:
        print(f"[!] Failed to load actions config: {e}")
        return {}

def execute(action, event_data=None, logger=None):
    actions = load_actions()
    action_def = actions.get(action)

    if not action_def:
        if logger:
            logger.log("ACTION_UNKNOWN", {"action": action})
        print(f"[!] Unknown action: {action}")
        return

    if action_def.get("type") != "command":
        print(f"[!] Unsupported action type: {action_def.get('type')}")
        return

    command = action_def.get("command", [])

    # Replace placeholders with event data
    if event_data:
        command = [
            str(event_data.get("pid")) if arg == "TARGET_PID" else
            str(os.getlogin()) if arg == "CURRENT_USER" else
            arg
            for arg in command
        ]

    try:
        subprocess.run(command, check=True)
        if logger:
            logger.log("ACTION_TAKEN", {"action": action, "command": command})
        print(f"[+] Action executed: {action}")
    except Exception as e:
        if logger:
            logger.log("ACTION_FAILED", {"action": action, "error": str(e)})
        print(f"[!] Failed to execute action {action}: {e}")
