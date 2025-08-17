import os
import platform
import getpass
import psutil
import datetime
import socket


def get_os_info():
    return {
        "system": platform.system(),
        "node": platform.node(),
        "release": platform.release(),
        "version": platform.version(),
        "architecture": platform.machine()
    }


def get_user_info():
    return {
        "username": getpass.getuser(),
        "home_dir": os.path.expanduser("~"),
        "shell": os.environ.get("SHELL", "unknown")
    }


def get_uptime():
    boot_time = datetime.datetime.fromtimestamp(psutil.boot_time())
    uptime = datetime.datetime.now() - boot_time
    return {
        "boot_time": str(boot_time),
        "uptime": str(uptime).split('.')[0]
    }


def get_cpu_info():
    return {
        "physical_cores": psutil.cpu_count(logical=False),
        "total_cores": psutil.cpu_count(logical=True),
        "cpu_percent": psutil.cpu_percent(interval=1)
    }


def get_memory_info():
    mem = psutil.virtual_memory()
    return {
        "total": f"{mem.total // (1024**2)} MB",
        "used": f"{mem.used // (1024**2)} MB",
        "available": f"{mem.available // (1024**2)} MB",
        "percent": f"{mem.percent}%"
    }


def get_network_info():
    try:
        hostname = socket.gethostname()
        local_ip = socket.gethostbyname(hostname)
    except Exception:
        local_ip = "UNKNOWN"
    return {
        "hostname": hostname,
        "local_ip": local_ip
    }


def collect_all_system_info():
    return {
        "os_info": get_os_info(),
        "user_info": get_user_info(),
        "uptime": get_uptime(),
        "cpu_info": get_cpu_info(),
        "memory_info": get_memory_info(),
        "network_info": get_network_info()
    }


if __name__ == "__main__":
    from pprint import pprint
    pprint(collect_all_system_info())
