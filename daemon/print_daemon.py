import os
import sys
import time
import requests
import tempfile
import subprocess
from pathlib import Path
from typing import List, Dict, Optional

# Configuration
API_BASE_URL = os.getenv('API_BASE_URL', 'http://localhost:3000')
DAEMON_SECRET_KEY = os.getenv('DAEMON_SECRET_KEY', '')
POLL_INTERVAL = 10  # seconds
TEMP_DIR = tempfile.gettempdir()

# Validate configuration
if not DAEMON_SECRET_KEY:
    print("ERROR: DAEMON_SECRET_KEY environment variable is not set!")
    print("Please set it to match the value in your .env.local file")
    sys.exit(1)

def log(message: str):
    """Print timestamped log message"""
    timestamp = time.strftime('%Y-%m-%d %H:%M:%S')
    print(f"[{timestamp}] {message}")

def get_pending_orders() -> Optional[List[Dict]]:
    """Fetch pending orders from the server"""
    try:
        headers = {
            'Authorization': f'Bearer {DAEMON_SECRET_KEY}'
        }

        response = requests.get(
            f'{API_BASE_URL}/api/daemon/pending',
            headers=headers,
            timeout=30
        )

        if response.status_code == 401:
            log("ERROR: Unauthorized - check your DAEMON_SECRET_KEY")
            return None

        if response.status_code != 200:
            log(f"ERROR: Failed to fetch orders (status {response.status_code})")
            return None

        data = response.json()
        return data.get('orders', [])

    except requests.exceptions.RequestException as e:
        log(f"ERROR: Network error - {e}")
        return None
    except Exception as e:
        log(f"ERROR: Failed to fetch orders - {e}")
        return None

def download_file(url: str, filename: str) -> Optional[str]:
    """Download file from signed URL to temp directory"""
    try:
        response = requests.get(url, timeout=60)

        if response.status_code != 200:
            log(f"ERROR: Failed to download file (status {response.status_code})")
            return None

        # Create temp file path
        temp_path = os.path.join(TEMP_DIR, f"print_{filename}")

        with open(temp_path, 'wb') as f:
            f.write(response.content)

        log(f"Downloaded: {filename} ({len(response.content)} bytes)")
        return temp_path

    except Exception as e:
        log(f"ERROR: Failed to download file - {e}")
        return None

def print_file_windows(file_path: str) -> bool:
    """Print file on Windows using default printer"""
    try:
        # Method 1: Try using Adobe Reader if available
        if file_path.lower().endswith('.pdf'):
            adobe_paths = [
                r"C:\Program Files\Adobe\Acrobat DC\Acrobat\Acrobat.exe",
                r"C:\Program Files (x86)\Adobe\Acrobat Reader DC\Reader\AcroRd32.exe",
                r"C:\Program Files\Adobe\Acrobat Reader DC\Reader\AcroRd32.exe",
            ]

            for adobe_path in adobe_paths:
                if os.path.exists(adobe_path):
                    log(f"Printing with Adobe Reader: {file_path}")
                    subprocess.run(
                        [adobe_path, "/t", file_path],
                        check=True,
                        creationflags=subprocess.CREATE_NO_WINDOW
                    )
                    time.sleep(3)  # Wait for print spooler
                    return True

        # Method 2: Try using SumatraPDF (best for silent printing)
        if file_path.lower().endswith('.pdf'):
            try:
                # Check if SumatraPDF is installed
                sumatra_paths = [
                    r"C:\Program Files\SumatraPDF\SumatraPDF.exe",
                    r"C:\Program Files (x86)\SumatraPDF\SumatraPDF.exe",
                ]

                sumatra_path = None
                for path in sumatra_paths:
                    if os.path.exists(path):
                        sumatra_path = path
                        break

                if sumatra_path:
                    log(f"Printing with SumatraPDF: {file_path}")
                    subprocess.run(
                        [sumatra_path, "-print-to-default", "-silent", file_path],
                        check=True,
                        creationflags=subprocess.CREATE_NO_WINDOW
                    )
                    time.sleep(2)  # Wait for print spooler
                    return True
            except Exception as e:
                log(f"SumatraPDF print failed: {e}")

        # Method 3: Use Windows Print API via command line (works without PDF viewer)
        log(f"Printing with Windows Print API: {file_path}")

        # Use the PRINT command which should work on any Windows system
        # First, try using the default application association
        try:
            # Create a batch file to print
            batch_path = os.path.join(TEMP_DIR, "print_job.bat")
            with open(batch_path, 'w') as f:
                # Use the PRINT command or copy to printer port
                f.write(f'@echo off\n')
                f.write(f'echo Printing file...\n')
                # Try to use the default print association
                f.write(f'rundll32.exe C:\\Windows\\System32\\shimgvw.dll,ImageView_PrintTo /pt "{file_path}" "HP LaserJet 1020"\n')

            # Execute the batch file
            result = subprocess.run(
                [batch_path],
                check=False,
                capture_output=True,
                creationflags=subprocess.CREATE_NO_WINDOW,
                timeout=10
            )

            # Clean up batch file
            try:
                os.remove(batch_path)
            except:
                pass

            if result.returncode == 0:
                time.sleep(3)
                return True
        except Exception as e:
            log(f"Batch print method failed: {e}")

        # Method 4: As last resort, tell user to install a PDF viewer
        log("ERROR: No PDF viewer found. Please install SumatraPDF or Adobe Reader")
        log("Download SumatraPDF: https://www.sumatrapdfreader.org/download-free-pdf-viewer")

        return False

    except Exception as e:
        log(f"ERROR: Failed to print file - {e}")
        return False

def mark_order_complete(order_id: str) -> bool:
    """Mark order as printed and trigger file cleanup"""
    try:
        headers = {
            'Authorization': f'Bearer {DAEMON_SECRET_KEY}',
            'Content-Type': 'application/json'
        }

        response = requests.post(
            f'{API_BASE_URL}/api/daemon/complete',
            headers=headers,
            json={'orderId': order_id},
            timeout=30
        )

        if response.status_code == 200:
            log(f"Order {order_id} marked as PRINTED")
            return True
        else:
            log(f"ERROR: Failed to mark order complete (status {response.status_code})")
            return False

    except Exception as e:
        log(f"ERROR: Failed to mark order complete - {e}")
        return False

def cleanup_temp_file(file_path: str):
    """Delete temporary file"""
    try:
        if os.path.exists(file_path):
            os.remove(file_path)
            log(f"Cleaned up temp file: {file_path}")
    except Exception as e:
        log(f"WARNING: Failed to delete temp file - {e}")

def process_order(order: Dict) -> bool:
    """Process a single print order (handles single and multi-file jobs)"""
    order_id = order['id']
    raw_urls = order['file_url']
    raw_filenames = order.get('filename') or order['file_url']
    page_count = order['page_count']

    # Split multi-file strings if comma-separated
    file_urls = [u.strip() for u in raw_urls.split(',') if u.strip()]
    filenames = [f.strip() for f in raw_filenames.split(',') if f.strip()]

    # Ensure matching count
    if len(filenames) < len(file_urls):
        filenames = filenames + [f"file_{i}.pdf" for i in range(len(filenames), len(file_urls))]

    log(f"Processing order {order_id} ({len(file_urls)} file(s), {page_count} total pages)")

    all_printed_successfully = True
    temp_files = []

    try:
        for idx, (url, fname) in enumerate(zip(file_urls, filenames)):
            log(f"Downloading file {idx+1}/{len(file_urls)}: {fname}")
            temp_path = download_file(url, fname)
            if not temp_path:
                all_printed_successfully = False
                break
            
            temp_files.append(temp_path)

            log(f"Printing file {idx+1}/{len(file_urls)}: {fname}")
            if not print_file_windows(temp_path):
                all_printed_successfully = False
                log(f"ERROR: Failed to print {fname}")
                break

        if all_printed_successfully:
            log(f"All {len(file_urls)} document(s) sent to printer successfully")
            if not mark_order_complete(order_id):
                log(f"WARNING: Order printed but failed to mark as complete")
            return True
        else:
            log(f"ERROR: Order {order_id} failed to print completely")
            return False

    finally:
        # Clean up all downloaded temp files
        for tpath in temp_files:
            cleanup_temp_file(tpath)

def main():
    """Main daemon loop"""
    log("=" * 60)
    log("Print Daemon Starting")
    log(f"API Base URL: {API_BASE_URL}")
    log(f"Poll Interval: {POLL_INTERVAL} seconds")
    log(f"Temp Directory: {TEMP_DIR}")
    log("=" * 60)

    consecutive_errors = 0
    max_consecutive_errors = 5

    while True:
        try:
            # Fetch pending orders
            orders = get_pending_orders()

            if orders is None:
                consecutive_errors += 1
                if consecutive_errors >= max_consecutive_errors:
                    log(f"ERROR: Too many consecutive errors ({consecutive_errors}). Check your configuration.")
                    log("Continuing to retry...")
            else:
                consecutive_errors = 0  # Reset error counter on success

                if len(orders) > 0:
                    log(f"Found {len(orders)} pending order(s)")

                    for order in orders:
                        try:
                            process_order(order)
                        except Exception as e:
                            log(f"ERROR: Failed to process order {order['id']}: {e}")
                            continue
                else:
                    log("No pending orders")

            # Wait before next poll
            time.sleep(POLL_INTERVAL)

        except KeyboardInterrupt:
            log("Daemon stopped by user")
            break
        except Exception as e:
            log(f"ERROR: Unexpected error in main loop - {e}")
            consecutive_errors += 1
            time.sleep(POLL_INTERVAL)

if __name__ == '__main__':
    main()
