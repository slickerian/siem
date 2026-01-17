#!/bin/bash
# Start watchdogs in background
python3 utils/watchdog_a.py &
python3 utils/watchdog_b.py &
# Start main process
python3 main.py
