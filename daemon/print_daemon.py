import os
import sys
import time
import tempfile
import subprocess
import json
import ssl

# Fallback for HTTP requests (supports both requests library and Python's built-in urllib)
try:
    import requests
    USE_REQUESTS = True
except ImportError:
    import urllib.request
    import urllib.error
    USE_REQUESTS = False

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

def log(message):
    """Print timestamped log message (Python 3.4+ compatible)"""
    timestamp = time.strftime('%Y-%m-%d %H:%M:%S')
    print("[{0}] {1}".format(timestamp, message))

def sub_run(cmd, creationflags=0):
    """Execute command compatible with Python 3.4 (no subprocess.run required)"""
    if hasattr(subprocess, 'run'):
        try:
            return subprocess.run(cmd, check=False, creationflags=creationflags)
        except Exception:
            pass
    try:
        proc = subprocess.Popen(cmd, creationflags=creationflags)
        proc.wait()
        return proc
    except Exception as e:
        log("Subprocess error: {0}".format(e))
        return None

def get_default_printer_name():
    """Detect default printer name on Windows"""
    try:
        create_no_window = getattr(subprocess, 'CREATE_NO_WINDOW', 0x08000000)
        cmd = ["powershell", "-NoProfile", "-Command", "(Get-WmiObject -Class Win32_Printer | Where-Object {$_.Default -eq $true}).Name"]
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, creationflags=create_no_window)
        out, _ = proc.communicate()
        if out:
            name = out.decode('utf-8', errors='ignore').strip()
            if name:
                return name
    except Exception:
        pass
    return "Default Windows Printer"

def find_sumatra_pdf():
    """Find any SumatraPDF executable (handles SumatraPDF-3.5.2-64.exe, SumatraPDF.exe, etc.)"""
    search_dirs = [
        os.getcwd(),
        os.path.dirname(__file__),
        r"C:\Program Files\SumatraPDF",
        r"C:\Program Files (x86)\SumatraPDF",
        TEMP_DIR
    ]
    for sdir in search_dirs:
        if sdir and os.path.exists(sdir):
            try:
                for fname in os.listdir(sdir):
                    if fname.lower().startswith("sumatra") and fname.lower().endswith(".exe"):
                        full_path = os.path.join(sdir, fname)
                        if os.path.isfile(full_path):
                            return full_path
            except Exception:
                pass
    return None

def convert_image_to_pdf(image_path, pdf_path):
    """Convert JPG/PNG image to PDF (Pillow if available, or pure-Python JPEG wrapper)"""
    # Attempt 1: Try Pillow if installed
    try:
        from PIL import Image
        img = Image.open(image_path)
        if img.mode != 'RGB':
            img = img.convert('RGB')
        img.save(pdf_path, "PDF", resolution=100.0)
        return True
    except Exception:
        pass

    # Attempt 2: Pure Python JPEG-to-PDF converter (Zero external dependencies!)
    try:
        with open(image_path, 'rb') as f:
            jpg_data = f.read()

        # Extract JPEG width & height from SOF markers (0xFFC0 - 0xFFC3)
        width, height = 612, 792
        idx = 0
        while idx < len(jpg_data) - 8:
            if jpg_data[idx] == 0xFF and jpg_data[idx+1] in (0xC0, 0xC1, 0xC2, 0xC3):
                height = (jpg_data[idx+5] << 8) + jpg_data[idx+6]
                width = (jpg_data[idx+7] << 8) + jpg_data[idx+8]
                break
            idx += 1

        # PDF page size: 8.5 x 11 inches in points (612 x 792)
        page_w, page_h = 612, 792
        scale = min(float(page_w) / width, float(page_h) / height)
        draw_w = int(width * scale)
        draw_h = int(height * scale)
        x = int((page_w - draw_w) / 2)
        y = int((page_h - draw_h) / 2)

        pdf_header = (
            "%PDF-1.3\n"
            "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
            "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
            "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {0} {1}] /Contents 4 0 R /Resources << /XObject << /I1 5 0 R >> >> >>\nendobj\n"
            "4 0 obj\n<< /Length {2} >>\nstream\n"
            "q\n{3} 0 0 {4} {5} {6} cm\n/I1 Do\nQ\n"
            "endstream\nendobj\n"
            "5 0 obj\n<< /Type /XObject /Subtype /Image /Width {7} /Height {8} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length {9} >>\n"
            "stream\n"
        ).format(
            page_w, page_h,
            len("q\n{0} 0 0 {1} {2} {3} cm\n/I1 Do\nQ\n".format(draw_w, draw_h, x, y)),
            draw_w, draw_h, x, y,
            width, height, len(jpg_data)
        )

        pdf_footer = "\nendstream\nendobj\nxref\n0 6\n0000000000 65535 f \ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n0\n%%EOF\n"

        with open(pdf_path, 'wb') as f:
            f.write(pdf_header.encode('latin1'))
            f.write(jpg_data)
            f.write(pdf_footer.encode('latin1'))

        return True
    except Exception as e:
        log("JPEG to PDF conversion failed: {0}".format(e))
        return False

def http_get_json(url, headers):
    """Perform HTTP GET returning JSON (works with requests or built-in urllib)"""
    if USE_REQUESTS:
        try:
            response = requests.get(url, headers=headers, timeout=30)
            if response.status_code == 401:
                return 401, None
            if response.status_code != 200:
                return response.status_code, None
            return 200, response.json()
        except Exception as e:
            log("HTTP GET exception: {0}".format(e))
            return 500, None
    else:
        try:
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=30, context=ctx) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                return 200, data
        except urllib.error.HTTPError as e:
            return e.code, None
        except Exception as e:
            log("HTTP GET exception: {0}".format(e))
            return 500, None

def http_download_file(url, temp_path):
    """Download file from URL to disk (works with requests or built-in urllib)"""
    if USE_REQUESTS:
        try:
            response = requests.get(url, timeout=60)
            if response.status_code != 200:
                log("Download failed with HTTP status {0}".format(response.status_code))
                return False, 0
            with open(temp_path, 'wb') as f:
                f.write(response.content)
            return True, len(response.content)
        except Exception as e:
            log("Download exception (requests): {0}".format(e))
            return False, 0
    else:
        try:
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            headers = {'User-Agent': 'Mozilla/5.0'}
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=60, context=ctx) as resp:
                content = resp.read()
                with open(temp_path, 'wb') as f:
                    f.write(content)
                return True, len(content)
        except Exception as e:
            log("Download exception (urllib): {0}".format(e))
            return False, 0

def http_post_json(url, headers, payload):
    """Perform HTTP POST with JSON body"""
    if USE_REQUESTS:
        try:
            response = requests.post(url, headers=headers, json=payload, timeout=30)
            return response.status_code == 200
        except Exception as e:
            log("HTTP POST exception: {0}".format(e))
            return False
    else:
        try:
            data = json.dumps(payload).encode('utf-8')
            headers['Content-Type'] = 'application/json'
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            req = urllib.request.Request(url, data=data, headers=headers, method='POST')
            with urllib.request.urlopen(req, timeout=30, context=ctx) as resp:
                return resp.status == 200
        except Exception as e:
            log("HTTP POST exception: {0}".format(e))
            return False

def get_pending_orders():
    """Fetch pending orders from the server"""
    try:
        headers = {
            'Authorization': 'Bearer {0}'.format(DAEMON_SECRET_KEY)
        }
        url = '{0}/api/daemon/pending'.format(API_BASE_URL)
        status, data = http_get_json(url, headers)

        if status == 401:
            log("ERROR: Unauthorized - check your DAEMON_SECRET_KEY")
            return None

        if status != 200 or data is None:
            log("ERROR: Failed to fetch orders (status {0})".format(status))
            return None

        return data.get('orders', [])

    except Exception as e:
        log("ERROR: Failed to fetch orders - {0}".format(e))
        return None

def download_file(url, filename):
    """Download file from signed URL to temp directory"""
    try:
        clean_fname = os.path.basename(str(filename or 'file')).replace(' ', '_')
        temp_path = os.path.join(TEMP_DIR, "print_{0}".format(clean_fname))
        success, bytes_len = http_download_file(url, temp_path)

        if not success or bytes_len == 0:
            log("ERROR: Failed to download file {0} (0 bytes)".format(filename))
            return None

        log("Downloaded: {0} ({1} bytes)".format(filename, bytes_len))
        return temp_path

    except Exception as e:
        log("ERROR: Failed to download file - {0}".format(e))
        return None

def print_file_windows(file_path):
    """Print file on Windows (PDFs, Images, DOCX) compatible with Windows 7+"""
    temp_pdf_to_cleanup = None
    try:
        create_no_window = getattr(subprocess, 'CREATE_NO_WINDOW', 0x08000000)
        abs_file_path = os.path.abspath(file_path)
        file_lower = abs_file_path.lower()

        if not os.path.exists(abs_file_path) or os.path.getsize(abs_file_path) == 0:
            log("ERROR: File does not exist or is 0 bytes: {0}".format(abs_file_path))
            return False

        # Convert image files (.jpg, .jpeg, .png, .bmp) to PDF for guaranteed silent printing
        if file_lower.endswith(('.jpg', '.jpeg', '.png', '.bmp')):
            pdf_path = abs_file_path + ".pdf"
            log("Converting image to PDF for silent print: {0}".format(os.path.basename(abs_file_path)))
            if convert_image_to_pdf(abs_file_path, pdf_path):
                abs_file_path = pdf_path
                file_lower = abs_file_path.lower()
                temp_pdf_to_cleanup = pdf_path

        # Method 1: Dynamic SumatraPDF search (Prints PDFs & converted images natively!)
        sumatra_path = find_sumatra_pdf()

        if sumatra_path and not file_lower.endswith(('.docx', '.doc')):
            log("Printing with SumatraPDF ({0}): {1}".format(os.path.basename(sumatra_path), abs_file_path))
            sub_run([sumatra_path, "-print-to-default", "-silent", abs_file_path], creationflags=create_no_window)
            time.sleep(4)
            return True

        # Method 2: DOCX / DOC Files (.docx, .doc) with embedded images
        if file_lower.endswith(('.docx', '.doc')):
            log("Printing DOCX with MS Word COM Engine: {0}".format(abs_file_path))
            try:
                ps_word = (
                    "$word = New-Object -ComObject Word.Application; "
                    "$word.Visible = $false; "
                    "$doc = $word.Documents.Open('{0}'); "
                    "$doc.PrintOut(); "
                    "Start-Sleep -s 4; "
                    "$doc.Close($false); "
                    "$word.Quit();"
                ).format(abs_file_path.replace('\\', '\\\\'))
                
                cmd = ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps_word]
                res = sub_run(cmd, creationflags=create_no_window)
                if res:
                    time.sleep(4)
                    return True
            except Exception as e:
                log("MS Word COM print failed: {0}".format(e))

            libre_paths = [
                r"C:\Program Files\LibreOffice\program\soffice.exe",
                r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
            ]
            for lpath in libre_paths:
                if os.path.exists(lpath):
                    log("Printing DOCX with LibreOffice: {0}".format(abs_file_path))
                    sub_run([lpath, "--headless", "-pt", "default", abs_file_path], creationflags=create_no_window)
                    time.sleep(4)
                    return True

        # Method 3: Image Files fallback using MSPaint
        if file_lower.endswith(('.jpg', '.jpeg', '.png', '.bmp')):
            log("Printing image with MSPaint (/p): {0}".format(abs_file_path))
            try:
                sub_run(["mspaint.exe", "/p", abs_file_path], creationflags=create_no_window)
                time.sleep(4)
                return True
            except Exception as e:
                log("MSPaint print failed: {0}".format(e))

        # Method 4: PDF Files using Adobe Reader
        if file_lower.endswith('.pdf'):
            adobe_paths = [
                r"C:\Program Files\Adobe\Acrobat DC\Acrobat\Acrobat.exe",
                r"C:\Program Files (x86)\Adobe\Acrobat Reader DC\Reader\AcroRd32.exe",
                r"C:\Program Files\Adobe\Acrobat Reader DC\Reader\AcroRd32.exe",
            ]
            for adobe_path in adobe_paths:
                if os.path.exists(adobe_path):
                    log("Printing PDF with Adobe Reader: {0}".format(abs_file_path))
                    sub_run([adobe_path, "/t", abs_file_path], creationflags=create_no_window)
                    time.sleep(4)
                    return True

        # Method 5: Fallback Shell Startfile for all other formats
        log("Printing with Windows Shell startfile fallback: {0}".format(abs_file_path))
        if hasattr(os, 'startfile'):
            os.startfile(abs_file_path, "print")
            time.sleep(5)
            return True

        log("ERROR: No print engine found.")
        return False

    except Exception as e:
        log("ERROR: Failed to print file - {0}".format(e))
        return False
    finally:
        if temp_pdf_to_cleanup and os.path.exists(temp_pdf_to_cleanup):
            try:
                os.remove(temp_pdf_to_cleanup)
            except:
                pass

def mark_order_complete(order_id):
    """Mark order as printed and trigger file cleanup"""
    try:
        headers = {
            'Authorization': 'Bearer {0}'.format(DAEMON_SECRET_KEY)
        }
        url = '{0}/api/daemon/complete'.format(API_BASE_URL)
        payload = {'orderId': order_id}

        if http_post_json(url, headers, payload):
            log("Order {0} marked as PRINTED".format(order_id))
            return True
        else:
            log("ERROR: Failed to mark order complete")
            return False

    except Exception as e:
        log("ERROR: Failed to mark order complete - {0}".format(e))
        return False

def cleanup_temp_file(file_path):
    """Delete temporary file"""
    try:
        if os.path.exists(file_path):
            os.remove(file_path)
            log("Cleaned up temp file: {0}".format(file_path))
    except Exception as e:
        log("WARNING: Failed to delete temp file - {0}".format(e))

def process_order(order):
    """Process a single print order (safely guards against None values)"""
    order_id = order.get('id', 'unknown')
    raw_urls = order.get('file_url') or ''
    raw_filenames = order.get('filename') or order.get('file_url') or ''
    page_count = order.get('page_count', 1)

    file_urls = [u.strip() for u in str(raw_urls).split(',') if u.strip()]
    filenames = [f.strip() for f in str(raw_filenames).split(',') if f.strip()]

    if len(file_urls) == 0:
        log("ERROR: Order {0} has no valid file URLs to download".format(order_id))
        return False

    if len(filenames) < len(file_urls):
        filenames = filenames + ["file_{0}.pdf".format(i) for i in range(len(filenames), len(file_urls))]

    log("Processing order {0} ({1} file(s), {2} total pages)".format(order_id, len(file_urls), page_count))

    all_printed_successfully = True
    temp_files = []

    try:
        for idx, (url, fname) in enumerate(zip(file_urls, filenames)):
            log("Downloading file {0}/{1}: {2}".format(idx+1, len(file_urls), fname))
            temp_path = download_file(url, fname)
            if not temp_path:
                all_printed_successfully = False
                log("ERROR: Download failed for file {0}".format(fname))
                break
            
            temp_files.append(temp_path)

            log("Printing file {0}/{1}: {2}".format(idx+1, len(file_urls), fname))
            if not print_file_windows(temp_path):
                all_printed_successfully = False
                log("ERROR: Failed to print {0}".format(fname))
                break

        if all_printed_successfully:
            log("All {0} document(s) sent to printer successfully".format(len(file_urls)))
            if not mark_order_complete(order_id):
                log("WARNING: Order printed but failed to mark as complete")
            return True
        else:
            log("ERROR: Order {0} failed to print completely".format(order_id))
            return False

    finally:
        for tpath in temp_files:
            cleanup_temp_file(tpath)

def main():
    """Main daemon loop"""
    log("=" * 60)
    log("Print Daemon Starting (Universal Python 3.4+ Mode)")
    log("API Base URL: {0}".format(API_BASE_URL))
    log("Poll Interval: {0} seconds".format(POLL_INTERVAL))
    log("Temp Directory: {0}".format(TEMP_DIR))
    
    default_printer = get_default_printer_name()
    log("Default Windows Printer: {0}".format(default_printer))

    sumatra_found = find_sumatra_pdf()
    if sumatra_found:
        log("SumatraPDF Detected: {0}".format(sumatra_found))
    else:
        log("SumatraPDF: Not detected (Using Windows MSPaint/Native Print Fallback)")
    log("=" * 60)

    consecutive_errors = 0
    max_consecutive_errors = 5

    while True:
        try:
            orders = get_pending_orders()

            if orders is None:
                consecutive_errors += 1
                if consecutive_errors >= max_consecutive_errors:
                    log("ERROR: Too many consecutive errors ({0}). Check configuration.".format(consecutive_errors))
                    log("Continuing to retry...")
            else:
                consecutive_errors = 0

                if len(orders) > 0:
                    log("Found {0} pending order(s)".format(len(orders)))

                    for order in orders:
                        try:
                            process_order(order)
                        except Exception as e:
                            log("ERROR: Failed to process order {0}: {1}".format(order.get('id', 'unknown'), e))
                            continue
                else:
                    log("No pending orders")

            time.sleep(POLL_INTERVAL)

        except KeyboardInterrupt:
            log("Daemon stopped by user")
            break
        except Exception as e:
            log("ERROR: Unexpected error in main loop - {0}".format(e))
            consecutive_errors += 1
            time.sleep(POLL_INTERVAL)

if __name__ == '__main__':
    main()
