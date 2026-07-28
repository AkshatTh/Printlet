# 🚀 Quick Start Guide

Get your College Printing Platform running in 15 minutes.

## Prerequisites

- Node.js 18+ installed
- Python 3.8+ installed (for print daemon)
- Supabase account (free)
- Razorpay account (free test mode)
- Windows PC with printer

---

## Step 1: Install Dependencies (2 minutes)

```bash
# Install Node.js dependencies
npm install

# Install Python dependencies
cd daemon
pip install -r requirements.txt
cd ..
```

---

## Step 2: Configure Supabase (5 minutes)

1. **Create project** at https://supabase.com
2. **Run database schema**:
   - Go to SQL Editor
   - Copy/paste contents of `supabase/schema.sql`
   - Click "Run"
3. **Create storage bucket**:
   - Go to Storage → New bucket
   - Name: `print-jobs`
   - Public: No
   - See `supabase/STORAGE_SETUP.md` for storage policies
4. **Get credentials**:
   - Go to Project Settings → API
   - Copy URL, anon key, and service_role key

---

## Step 3: Configure Razorpay (3 minutes)

1. Sign up at https://razorpay.com
2. Go to Settings → API Keys
3. Generate Test Key
4. Copy Key ID and Key Secret

---

## Step 4: Set Environment Variables (2 minutes)

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Edit `.env.local` and fill in:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
RAZORPAY_KEY_ID=rzp_test_xxxxx
RAZORPAY_KEY_SECRET=xxxxx
DAEMON_SECRET_KEY=generate-random-32char-string
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

**Generate DAEMON_SECRET_KEY** (Git Bash):
```bash
openssl rand -hex 32
```

---

## Step 5: Start the Application (1 minute)

**Terminal 1 - Next.js Server:**
```bash
npm run dev
```

**Terminal 2 - Print Daemon:**
```bash
cd daemon
set DAEMON_SECRET_KEY=same-as-env-local
set API_BASE_URL=http://localhost:3000
python print_daemon.py
```

---

## Step 6: Test It! (2 minutes)

1. Open http://localhost:3000
2. Upload a test PDF
3. Click "Calculate Price"
4. Click "Pay with Razorpay"
5. Use test card:
   - Card: `4111 1111 1111 1111`
   - Expiry: `12/30`
   - CVV: `123`
6. Complete payment
7. Check daemon terminal - should print within 10 seconds!

---

## ✅ Success Indicators

You should see:

### Frontend (Browser)
- ✅ File upload working
- ✅ Price calculation showing correct amount
- ✅ Razorpay modal opening
- ✅ Payment success screen after test payment

### Backend (Terminal 1)
```
✓ Ready in XXXms
○ Compiling / ...
✓ Compiled / in XXXms
```

### Daemon (Terminal 2)
```
[2026-07-26 19:55:00] Print Daemon Starting
[2026-07-26 19:55:00] No pending orders
[2026-07-26 19:55:30] Found 1 pending order(s)
[2026-07-26 19:55:30] Processing order abc-123...
[2026-07-26 19:55:31] Print job sent to printer (5 pages)
[2026-07-26 19:55:31] Order abc-123 marked as PRINTED
```

### Supabase Dashboard
- ✅ Orders table has entry with status `PRINTED`
- ✅ Storage bucket had file (now deleted after print)

---

## 🔧 Troubleshooting

### Can't connect to localhost:3000
- Make sure `npm run dev` is running
- Check no other app is using port 3000

### Payment fails
- Verify Razorpay test keys are correct
- Check browser console for errors

### Daemon can't connect
- Verify `DAEMON_SECRET_KEY` matches in both terminals
- Check `API_BASE_URL=http://localhost:3000`

### File doesn't print
- Ensure printer is set as Windows default
- Install SumatraPDF: https://www.sumatrapdfreader.org
- Check printer is online and has paper

---

## 📚 Next Steps

### For Development
- Customize pricing in `app/api/upload/route.ts`
- Modify UI styling in `app/page.tsx`
- Add more file type support

### For Production
- Follow `DEPLOYMENT.md` for Vercel deployment
- Switch to Razorpay Live keys (after KYC)
- Set up daemon as Windows service
- Add monitoring and analytics

---

## 📖 Documentation

- `README.md` - Project overview
- `DEPLOYMENT.md` - Complete deployment guide
- `daemon/README.md` - Daemon setup details
- `supabase/STORAGE_SETUP.md` - Storage configuration

---

## 💰 Pricing Model

Default configuration:
- **₹4 per page**
- **₹1 for staple** (optional)

Example: 10-page document with staple = ₹41

To change pricing, edit `app/api/upload/route.ts`:
```typescript
const PRICE_PER_PAGE = 4; // Change this
const STAPLE_COST = 1;    // Change this
```

---

## 🎉 You're Ready!

Your zero-cost college printing platform is now running!

**What you built:**
- ✅ File upload with automatic page counting
- ✅ Real-time pricing calculator
- ✅ Razorpay payment integration
- ✅ Automated print daemon
- ✅ Cloud storage with auto-cleanup
- ✅ 100% free tier hosting (Vercel + Supabase)

**Start printing! 🖨️**
