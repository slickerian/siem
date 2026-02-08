
import re

log_data = "Devices 192.168.1.10 and 192.168.1.1 (5 connections) [Port: 443 | Process: chrome.exe]"
log_data_simple = "Devices 192.168.1.5 and 192.168.1.1"

# Regex from siem_node/core/network_discovery.py:
# f"Devices {local_ip} and {remote_ip} ({count} connections) [Port: {remote_port} | Process: {process}]"

# Regex to parse it back:
regex = r"Devices\s+([^\s]+)\s+and\s+([^\s]+)\s*(?:\((\d+)\s+connections\))?\s*(?:\[Port:\s*(\d+|None)\s*\|\s*Process:\s*([^\]]+)\])?"

match = re.match(regex, log_data)
if match:
    print(f"Match 1: {match.groups()}")
else:
    print("No match 1")

match2 = re.match(regex, log_data_simple)
if match2:
    print(f"Match 2: {match2.groups()}")
else:
    print("No match 2")
