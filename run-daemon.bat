@echo off
REM Windows batch script to run the print daemon

IF "%DAEMON_SECRET_KEY%"=="" (
    echo [!] DAEMON_SECRET_KEY environment variable is not set.
    set /p DAEMON_SECRET_KEY="Enter your DAEMON_SECRET_KEY: "
)

IF "%API_BASE_URL%"=="" (
    echo [*] API_BASE_URL not set. Defaulting to http://localhost:3000
    set API_BASE_URL=http://localhost:3000
)

echo [*] Starting Print Daemon with API_BASE_URL=%API_BASE_URL%...
cd daemon
python print_daemon.py
pause
