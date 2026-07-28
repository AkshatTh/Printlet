# Print Daemon Setup Guide

The Python print daemon runs on your local Windows machine and automatically prints paid orders.

## Prerequisites

- **Python 3.8+** installed on Windows
- **HP LaserJet 1020** (or any Windows printer) set as default
- **Network access** to your Next.js server (localhost or deployed URL)

## Installation

### 1. Install Python Dependencies

```bash
cd daemon
pip install -r requirements.txt
```

**Note:** If you encounter issues installing `pywin32`, you can skip it. The daemon will fall back to using `os.startfile()` which works for most file types.

### 2. Configure Environment Variables

Create a `.env` file in the `daemon` folder or set environment variables:

```bash
# Required
DAEMON_SECRET_KEY=your-secret-key-from-env-local

# Optional (defaults to http://localhost:3000)
API_BASE_URL=http://localhost:3000
```

**For production (Vercel deployment):**
```bash
API_BASE_URL=https://your-app.vercel.app
DAEMON_SECRET_KEY=your-secret-key
```

### 3. Set Default Printer

Make sure your HP LaserJet 1020 is set as the default Windows printer:

1. Open **Settings** → **Devices** → **Printers & scanners**
2. Click on your **HP LaserJet 1020**
3. Click **Manage** → **Set as default**

### 4. (Optional) Install SumatraPDF for Better PDF Printing

For silent, reliable PDF printing, install SumatraPDF:

1. Download from: https://www.sumatrapdfreader.org/download-free-pdf-viewer
2. Install to default location: `C:\Program Files\SumatraPDF\`
3. The daemon will automatically detect and use it for PDFs

## Running the Daemon

### Development (with local Next.js server)

```bash
# Terminal 1: Run Next.js dev server
npm run dev

# Terminal 2: Run print daemon
cd daemon
python print_daemon.py
```

### Production (with Vercel deployment)

```bash
cd daemon
set API_BASE_URL=https://your-app.vercel.app
set DAEMON_SECRET_KEY=your-secret-key
python print_daemon.py
```

## How It Works

1. **Polling**: Daemon polls `/api/daemon/pending` every 10 seconds
2. **Authentication**: Uses `Bearer {DAEMON_SECRET_KEY}` header for security
3. **Download**: Downloads files from Supabase signed URLs to temp folder
4. **Print**: Sends file to default Windows printer
5. **Cleanup**: 
   - Calls `/api/daemon/complete` to mark order as PRINTED
   - Server deletes file from Supabase Storage (saves space)
   - Daemon deletes local temp file

## Daemon Output

```
[2026-07-26 19:53:00] ============================================================
[2026-07-26 19:53:00] Print Daemon Starting
[2026-07-26 19:53:00] API Base URL: http://localhost:3000
[2026-07-26 19:53:00] Poll Interval: 10 seconds
[2026-07-26 19:53:00] Temp Directory: C:\Users\...\AppData\Local\Temp
[2026-07-26 19:53:00] ============================================================
[2026-07-26 19:53:00] No pending orders
[2026-07-26 19:53:10] Found 1 pending order(s)
[2026-07-26 19:53:10] Processing order abc-123-def (5 pages)
[2026-07-26 19:53:11] Downloaded: 1737923456-xyz789.pdf (245678 bytes)
[2026-07-26 19:53:11] Printing with SumatraPDF: C:\Users\...\Temp\print_1737923456-xyz789.pdf
[2026-07-26 19:53:13] Print job sent to printer (5 pages)
[2026-07-26 19:53:13] Order abc-123-def marked as PRINTED
[2026-07-26 19:53:13] Cleaned up temp file: C:\Users\...\Temp\print_1737923456-xyz789.pdf
```

## Troubleshooting

### "ERROR: Unauthorized - check your DAEMON_SECRET_KEY"

- Ensure `DAEMON_SECRET_KEY` matches the value in `.env.local`
- Check that the environment variable is set correctly

### "ERROR: Network error - Connection refused"

- Make sure your Next.js server is running
- Check `API_BASE_URL` is correct (http://localhost:3000 for dev)

### "ERROR: Failed to print file"

- Verify printer is set as default in Windows
- Check printer is online and has paper
- Try printing a test page from Windows settings

### Files Not Printing (No Error)

- Install SumatraPDF for more reliable silent printing
- Check Windows print spooler service is running:
  ```bash
  net start spooler
  ```

### "pywin32 installation failed"

You can safely skip pywin32. The daemon will use the fallback method:

```bash
pip install requests
# Skip pywin32
```

## Running as a Windows Service (Optional)

For production, you may want to run the daemon as a Windows service:

1. Install NSSM (Non-Sucking Service Manager): https://nssm.cc/
2. Create service:
   ```bash
   nssm install PrintDaemon "C:\Python\python.exe" "C:\path\to\daemon\print_daemon.py"
   nssm set PrintDaemon AppDirectory "C:\path\to\daemon"
   nssm set PrintDaemon AppEnvironmentExtra "DAEMON_SECRET_KEY=your-key" "API_BASE_URL=your-url"
   nssm start PrintDaemon
   ```

## Security Notes

- **DAEMON_SECRET_KEY** should be a strong random string (32+ characters)
- Never commit this key to git
- Only the daemon should have access to this key
- Rotate the key periodically for security

## Performance

- **Polling interval**: 10 seconds (configurable in script)
- **Network timeout**: 30 seconds for API calls, 60 seconds for downloads
- **Error handling**: Continues running after network errors
- **Memory usage**: ~50-100MB (depends on file sizes)
