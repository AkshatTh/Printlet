# College Printing Micro-SaaS

A complete zero-cost printing platform for students. Upload documents, pay via Razorpay, and print automatically to a local printer.

## Architecture

- **Frontend/Backend**: Next.js 16 (App Router) + Tailwind CSS
- **Database & Storage**: Supabase (PostgreSQL + Storage)
- **Payments**: Razorpay
- **Local Print Daemon**: Python 3

## Pricing

- ₹4 per page
- ₹1 optional staple fee

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env.local` and fill in your credentials:

```bash
cp .env.example .env.local
```

**Required variables:**
- `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key (for server-side operations)
- `RAZORPAY_KEY_ID`: Your Razorpay key ID
- `RAZORPAY_KEY_SECRET`: Your Razorpay secret
- `DAEMON_SECRET_KEY`: Generate a strong random string (e.g., `openssl rand -hex 32`)

### 3. Set Up Supabase

1. Create a new Supabase project at https://supabase.com
2. Run the SQL schema from `supabase/schema.sql` in the Supabase SQL Editor
3. Create a storage bucket named `print-jobs`:
   - Go to Storage in Supabase dashboard
   - Click "New bucket"
   - Name: `print-jobs`
   - Public bucket: No (private)
   - File size limit: 50 MB
   - Allowed MIME types: `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `image/png`, `image/jpeg`

### 4. Set Up Razorpay

1. Sign up at https://razorpay.com
2. Get your test API keys from the dashboard
3. Add them to `.env.local`

### 5. Run Development Server

```bash
npm run dev
```

Open http://localhost:3000

### 6. Set Up Print Daemon (Local Machine)

```bash
cd daemon
pip install -r requirements.txt
python print_daemon.py
```

The daemon will:
- Poll for paid orders every 10 seconds
- Download files to temp folder
- Print to default Windows printer
- Clean up files from cloud and local storage

## Project Structure

```
printing-platform/
├── app/
│   ├── api/
│   │   ├── upload/          # File upload & page count
│   │   ├── checkout/        # Razorpay order creation
│   │   ├── verify/          # Payment verification webhook
│   │   └── daemon/
│   │       ├── pending/     # Get paid orders (daemon)
│   │       └── complete/    # Mark as printed (daemon)
│   ├── page.tsx             # Landing page
│   └── layout.tsx
├── daemon/
│   ├── print_daemon.py      # Python print daemon
│   └── requirements.txt
├── supabase/
│   └── schema.sql           # Database schema
└── .env.local               # Environment variables (not committed)
```

## Free Tier Limits

- **Vercel**: 100GB bandwidth, unlimited requests
- **Supabase**: 500MB database, 1GB storage (auto-cleanup enabled)
- **Razorpay**: Free for test mode, 2% fee in production

## Security

- All daemon endpoints require `DAEMON_SECRET_KEY` header
- Row Level Security (RLS) enabled on Supabase
- Files automatically deleted after printing to stay within storage limits
- No sensitive data stored in frontend

## License

MIT
