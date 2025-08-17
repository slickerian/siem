#core/policy_engine.py
import yaml
import os
import ast
from core import response_actions

# Config file paths
RULES_FILE = os.path.join(os.path.dirname(__file__), "..", "config", "rules.yml")
PATHS_FILE = os.path.join(os.path.dirname(__file__), "..", "config", "paths.yml")

def load_yaml(path):
    try:
        with open(path, "r") as file:
            return yaml.safe_load(file) or {}
    except Exception as e:
        print(f"[!] Failed to load {path}: {e}")
        return {}

def load_rules():
    """Load only event-based rules (skip global keys like suspicious_binaries)."""
    data = load_yaml(RULES_FILE)
    return {k: v for k, v in data.items() if k not in ("suspicious_binaries",)}

def load_monitored_paths():
    data = load_yaml(PATHS_FILE)
    return data.get("monitored_paths", [])

def load_suspicious_binaries():
    data = load_yaml(RULES_FILE)
    return data.get("suspicious_binaries", [])

def compare_values(field_value, value, comparison):
    """Handles string and numeric comparisons safely."""
    try:
        # Try to cast to float for numeric comparisons
        fv = float(field_value)
        val = float(value)
    except (ValueError, TypeError):
        # Fallback to string comparison
        fv, val = str(field_value), str(value)

    if comparison == "equals":
        return fv == val
    elif comparison == "contains":
        return str(val) in str(fv)
    elif comparison == "startswith":
        return str(fv).startswith(str(val))
    elif comparison == "endswith":
        return str(fv).endswith(str(val))
    elif comparison == "less_than":
        return isinstance(fv, (int, float)) and fv < val
    elif comparison == "greater_than":
        return isinstance(fv, (int, float)) and fv > val

    return False

def evaluate(events, logger):
    """
    Evaluates recent log events against YAML rules.
    Returns a list of actions for response_actions.execute().
    """
    rules = load_rules()
    actions_to_take = []

    for event in events:
        try:
            parts = event.split("|", 2)
            if len(parts) < 3:
                continue

            event_type = parts[1].strip()
            event_data_str = parts[2].strip()
            try:
                event_data = ast.literal_eval(event_data_str) if event_data_str.startswith("{") else {}
            except Exception:
                event_data = {}

            # Skip if no rules exist for this event type
            if event_type not in rules:
                continue

            for rule in rules[event_type]:
                field = rule.get("field")
                value = rule.get("value")
                action = rule.get("action")
                comparison = rule.get("comparison", "equals")

                if field in event_data:
                    if compare_values(event_data[field], value, comparison):
                        logger.log("POLICY_TRIGGER", {
                            "event": event_type,
                            "action": action,
                            "details": event_data
                        })
                        actions_to_take.append((action, event_data))
        except Exception as e:
            logger.log("POLICY_ENGINE_ERROR", {"error": str(e)})

    return actions_to_take
