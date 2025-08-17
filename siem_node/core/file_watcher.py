import os
import time
import threading
import yaml
from inotify_simple import INotify, flags
from utils.colors import color_text, RED, GREEN, YELLOW, CYAN, MAGENTA, RESET, BLUE

CONFIG_PATHS = os.path.join(os.path.dirname(__file__), "..", "config", "paths.yml")

def load_paths():
    """Load monitored paths and whitelist files from YAML config."""
    try:
        with open(CONFIG_PATHS, "r") as f:
            data = yaml.safe_load(f) or {}
            monitored_paths = data.get("monitored_paths", [])
            white_list = data.get("white_list_files", [])
            return monitored_paths, white_list
    except:
        return [], []

def watch_path(inotify, path, path_lookup):
    """Recursively add directories/files for monitoring."""
    if os.path.isdir(path):
        for root, dirs, files in os.walk(path):
            try:
                wd = inotify.add_watch(
                    root,
                    flags.MODIFY | flags.OPEN | flags.ACCESS | flags.ATTRIB | flags.DELETE
                )
                path_lookup[wd] = root
            except PermissionError:
                print(color_text(f"[!] Permission denied on {root}", YELLOW))
    elif os.path.exists(path):
        try:
            wd = inotify.add_watch(
                path,
                flags.MODIFY | flags.OPEN | flags.ACCESS | flags.ATTRIB | flags.DELETE
            )
            path_lookup[wd] = os.path.dirname(path)
        except PermissionError:
            print(color_text(f"[!] Permission denied on {path}", YELLOW))
    else:
        print(color_text(f"[!] Path not found: {path}", RED))

def handle_event(event, path_lookup, logger, white_list):
    for flag in flags.from_mask(event.mask):
        event_type = None
        if flag == flags.OPEN:
            event_type = 'open'
        elif flag == flags.ACCESS:
            event_type = 'read'
        elif flag == flags.MODIFY:
            event_type = 'modify'
        elif flag == flags.ATTRIB:
            event_type = 'metadata_change'
        elif flag == flags.DELETE:
            event_type = 'delete'

        if event_type:
            pathname = os.path.join(path_lookup[event.wd], event.name) if event.name else path_lookup[event.wd]
            
            # Skip whitelisted files
            if any(pathname.startswith(whitelisted) for whitelisted in white_list):
                continue

            # Log and print event
            logger.log(f"FILE_{event_type.upper()}", {
                "pathname": pathname,
                "timestamp": time.time(),
                "event": event_type
            })
            print(color_text(f"[EVENT] File {event_type}: {pathname}", MAGENTA))

def start(logger):
    print(color_text("[*] File Monitor Started...", GREEN))
    inotify = INotify()
    path_lookup = {}

    # Load monitored paths and whitelist
    watched_paths, white_list = load_paths()

    for path in watched_paths:
        watch_path(inotify, path, path_lookup)

    def monitor_loop():
        while True:
            for event in inotify.read():
                handle_event(event, path_lookup, logger, white_list)

    thread = threading.Thread(target=monitor_loop, daemon=True)
    thread.start()
