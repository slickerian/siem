import socket
import uuid
import platform
import hashlib
import subprocess


def get_hostname():
    return socket.gethostname()


def get_mac_address():
    try:
        # Using uuid module for MAC
        mac = uuid.getnode()
        return ':'.join(("%012X" % mac)[i:i + 2] for i in range(0, 12, 2))
    except Exception:
        return "UNKNOWN"


def get_machine_id():
    try:
        with open("/etc/machine-id", "r") as f:
            return f.read().strip()
    except FileNotFoundError:
        return "NO_MACHINE_ID"


def get_disk_serial():
    try:
        result = subprocess.check_output("udevadm info --query=all --name=/dev/sda | grep ID_SERIAL_SHORT", shell=True)
        return result.decode().strip().split('=')[-1]
    except Exception:
        return "NO_DISK_ID"


def generate_device_fingerprint():
    # Combine all identifiers
    raw_data = f"{get_hostname()}|{get_mac_address()}|{get_machine_id()}|{get_disk_serial()}"
    fingerprint = hashlib.sha256(raw_data.encode()).hexdigest()
    return fingerprint


if __name__ == "__main__":
    print("[*] Hostname:", get_hostname())
    print("[*] MAC Address:", get_mac_address())
    print("[*] Machine ID:", get_machine_id())
    print("[*] Disk Serial:", get_disk_serial())
    print("[*] Device Fingerprint:", generate_device_fingerprint())
