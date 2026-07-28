#!/bin/bash
# Shell script to run the print daemon

if [ -z "$DAEMON_SECRET_KEY" ]; then
    echo "[!] DAEMON_SECRET_KEY is not set."
    read -sp "Enter your DAEMON_SECRET_KEY: " DAEMON_SECRET_KEY
    echo ""
    export DAEMON_SECRET_KEY
fi

if [ -z "$API_BASE_URL" ]; then
    echo "[*] API_BASE_URL not set. Defaulting to http://localhost:3000"
    export API_BASE_URL="http://localhost:3000"
fi

echo "[*] Starting Print Daemon with API_BASE_URL=$API_BASE_URL..."
cd daemon
python print_daemon.py
