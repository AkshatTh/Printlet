# Deployment Guide

Complete guide to deploying your College Printing Micro-SaaS.

## Quick Start Checklist

- [ ] Supabase project created
- [ ] Database schema executed
- [ ] Storage bucket configured
- [ ] Razorpay account set up
- [ ] Environment variables configured
- [ ] Vercel deployment done
- [ ] Print daemon running locally

---

## 1. Supabase Setup

### Create Project

1. Go to https://supabase.com
2. Click "New Project"
3. Fill in:
   - **Name**: `college-printing`
   - **Database Password**: (generate strong password)
   - **Region**: Choose closest to your location
4. Wait for project to be ready (~2 minutes)

### Run Database Schema

1. Go to **SQL Editor** in Supabase dashboard
2. Click "New Query"
3. Copy contents of `supabase/schema.sql`
4. Click "Run" to execute
5. Verify: Go to **Table Editor** → should see `orders` table

### Create Storage Bucket

1. Go to **Storage** in Supabase dashboard
2. Click "New bucket"
3. Configure:
   - **Name**: `print-jobs`
   - **Public**: No (keep private)
   - **File size limit**: 52428800 (50MB)
   - **Allowed MIME types**: `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `image/png`, `image/jpeg`
4. Click "Create bucket"

### Set Storage Policies

Go to **Storage** → **Policies** → **print-jobs** and add these policies:

```sql
-- Allow public uploads
CREATE POLICY "Allow public uploads"
ON storage.objects
FOR INSERT
TO anon
WITH CHECK (bucket_id = 'print-jobs');

-- Allow service role full access
CREATE POLICY "Allow service role full access"
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id = 'print-jobs')
WITH CHECK (bucket_id = 'print-jobs');

-- Allow authenticated read
CREATE POLICY "Allow authenticated read"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'print-jobs');

-- Allow service role delete
CREATE POLICY "Allow service role delete"
ON storage.objects
FOR DELETE
TO service_role
USING (bucket_id = 'print-jobs');
```

### Get API Credentials

1. Go to **Project Settings** → **API**
2. Copy these values:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** → `SUPABASE_SERVICE_ROLE_KEY` ⚠️ **Keep secret!**

---

## 2. Razorpay Setup

### Create Account

1. Sign up at https://razorpay.com
2. Complete KYC verification (required for live mode)
3. For testing, you can use Test Mode immediately

### Get API Keys

1. Go to **Settings** → **API Keys**
2. For **Test Mode**:
   - Click "Generate Test Key"
   - Copy **Key ID** → `RAZORPAY_KEY_ID`
   - Copy **Key Secret** → `RAZORPAY_KEY_SECRET`
3. For **Live Mode** (after KYC):
   - Click "Generate Live Key"
   - Copy credentials

### Configure Webhook (Optional)

For production, set up a webhook to handle payment confirmations:

1. Go to **Settings** → **Webhooks**
2. Add webhook URL: `https://your-app.vercel.app/api/verify`
3. Select events: `payment.captured`, `payment.failed`

---

## 3. Environment Configuration

### Local Development (`.env.local`)

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Razorpay (Test Mode)
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx

# Daemon Secret (generate with: openssl rand -hex 32)
DAEMON_SECRET_KEY=abc123def456...your-random-string...xyz789

# Base URL
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

### Generate DAEMON_SECRET_KEY

**Windows (PowerShell):**
```powershell
-join ((48..57) + (97..102) | Get-Random -Count 64 | % {[char]$_})
```

**Windows (Git Bash):**
```bash
openssl rand -hex 32
```

**Alternative:**
Use any strong random string generator (minimum 32 characters)

---

## 4. Vercel Deployment

### Install Vercel CLI (Optional)

```bash
npm install -g vercel
```

### Deploy via GitHub (Recommended)

1. Push code to GitHub:
   ```bash
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/yourusername/printing-platform.git
   git push -u origin main
   ```

2. Go to https://vercel.com
3. Click "New Project"
4. Import your GitHub repository
5. Configure:
   - **Framework Preset**: Next.js
   - **Root Directory**: `./`
   - **Build Command**: `npm run build`
   - **Output Directory**: (leave default)

6. Add Environment Variables:
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...
   RAZORPAY_KEY_ID=...
   RAZORPAY_KEY_SECRET=...
   DAEMON_SECRET_KEY=...
   NEXT_PUBLIC_BASE_URL=https://your-app.vercel.app
   ```

7. Click "Deploy"

### Deploy via CLI

```bash
vercel
# Follow prompts
# Add environment variables when prompted
```

### Verify Deployment

1. Visit your Vercel URL (e.g., `https://your-app.vercel.app`)
2. Try uploading a test PDF
3. Check Supabase Storage → should see uploaded file
4. Check Supabase Table Editor → should see order with `PENDING` status

---

## 5. Print Daemon Setup (Local Machine)

### Prerequisites

- Windows 10/11
- Python 3.8+
- HP LaserJet 1020 (or any printer) set as default

### Install Python Dependencies

```bash
cd daemon
pip install -r requirements.txt
```

### Configure Daemon

Create `daemon/.env`:

```bash
# For local testing
API_BASE_URL=http://localhost:3000
DAEMON_SECRET_KEY=same-as-your-env-local

# For production
API_BASE_URL=https://your-app.vercel.app
DAEMON_SECRET_KEY=same-as-vercel
```

### Run Daemon

```bash
cd daemon
python print_daemon.py
```

You should see:
```
[2026-07-26 19:53:00] ============================================================
[2026-07-26 19:53:00] Print Daemon Starting
[2026-07-26 19:53:00] API Base URL: http://localhost:3000
[2026-07-26 19:53:00] Poll Interval: 10 seconds
[2026-07-26 19:53:00] ============================================================
[2026-07-26 19:53:00] No pending orders
```

---

## 6. Testing End-to-End

### Test Payment Flow

1. Visit your app (localhost or Vercel URL)
2. Upload a test PDF
3. Click "Calculate Price"
4. Click "Pay with Razorpay"
5. Use test card:
   - **Card Number**: `4111 1111 1111 1111`
   - **Expiry**: Any future date
   - **CVV**: `123`
   - **Name**: Any name
6. Complete payment

### Verify Print Job

1. Daemon should detect the paid order within 10 seconds
2. Check daemon logs:
   ```
   [2026-07-26 19:54:10] Found 1 pending order(s)
   [2026-07-26 19:54:10] Processing order abc-123-def (5 pages)
   [2026-07-26 19:54:11] Downloaded: 1737923456-xyz789.pdf (245678 bytes)
   [2026-07-26 19:54:11] Printing with SumatraPDF: ...
   [2026-07-26 19:54:13] Print job sent to printer (5 pages)
   [2026-07-26 19:54:13] Order abc-123-def marked as PRINTED
   ```
3. Check printer → document should print
4. Verify in Supabase:
   - Table Editor → order status should be `PRINTED`
   - Storage → file should be deleted

---

## 7. Production Checklist

Before going live with real payments:

- [ ] **Razorpay KYC completed**
- [ ] **Switch to Razorpay Live Keys** (not test keys)
- [ ] **Test with real small amount** (₹1 test transaction)
- [ ] **Verify printer reliability** (test 20+ prints)
- [ ] **Set up monitoring** (check daemon logs daily)
- [ ] **Backup strategy** (export Supabase DB weekly)
- [ ] **Customer support** (phone number, email for issues)
- [ ] **Terms & Conditions** (refund policy, print quality disclaimers)
- [ ] **Privacy Policy** (GDPR compliance if applicable)

---

## 8. Monitoring & Maintenance

### Check Supabase Storage Usage

```sql
-- Run in Supabase SQL Editor
SELECT 
  pg_size_pretty(sum((metadata->>'size')::bigint)) as total_size,
  count(*) as file_count
FROM storage.objects
WHERE bucket_id = 'print-jobs';
```

Should stay under 1GB. Auto-cleanup should keep it near 0 bytes.

### Clean Up Old Pending Orders

```sql
-- Run weekly to remove abandoned orders (>24h old, unpaid)
SELECT cleanup_old_pending_orders();
```

### Monitor Daemon Uptime

Set up a simple health check or just monitor the logs. If daemon crashes, restart it.

### Razorpay Dashboard

Check **Razorpay Dashboard** → **Transactions** daily to:
- Verify payments are processing correctly
- Check for failed/disputed payments
- Track revenue

---

## 9. Costs (Free Tier Limits)

### Vercel
- ✅ **100GB bandwidth/month** (free)
- ✅ **Unlimited requests** (free)
- ⚠️ Serverless function timeout: 10s (free), 60s (pro)

### Supabase
- ✅ **500MB database** (free)
- ✅ **1GB storage** (free with auto-cleanup)
- ✅ **50,000 monthly active users** (free)
- ⚠️ After limits: $25/month for Pro

### Razorpay
- ✅ **Test mode: Free forever**
- 💰 **Live mode: 2% per transaction** (industry standard)
- Example: ₹20 order = ₹0.40 fee

### Total Cost for 1000 prints/month
- Vercel: ₹0
- Supabase: ₹0 (with cleanup)
- Razorpay: ~₹400 (2% of ~₹20,000 revenue)
- **Net profit: ~₹19,600** (98% margin)

---

## 10. Troubleshooting

### "File upload failed"
- Check Supabase Storage bucket exists and is named exactly `print-jobs`
- Verify storage policies are set correctly
- Check file size < 50MB

### "Payment verification failed"
- Verify `RAZORPAY_KEY_SECRET` is correct
- Check Razorpay dashboard for payment status
- Look at server logs (Vercel → Logs)

### "Daemon can't connect"
- Check `API_BASE_URL` is correct
- Verify `DAEMON_SECRET_KEY` matches
- Test endpoint manually:
  ```bash
  curl -H "Authorization: Bearer your-secret" https://your-app.vercel.app/api/daemon/pending
  ```

### "Files not printing"
- Check printer is online and set as default
- Install SumatraPDF for better PDF printing
- Check Windows print spooler: `net start spooler`

---

## Need Help?

1. Check logs:
   - **Vercel**: Dashboard → Logs
   - **Supabase**: Dashboard → Logs
   - **Daemon**: Terminal output

2. Common issues are documented in:
   - `daemon/README.md` (printing issues)
   - `supabase/STORAGE_SETUP.md` (storage issues)

3. Test individual components:
   - Upload API: `curl -F "file=@test.pdf" http://localhost:3000/api/upload`
   - Daemon auth: `curl -H "Authorization: Bearer key" http://localhost:3000/api/daemon/pending`

Good luck with your printing business! 🚀
