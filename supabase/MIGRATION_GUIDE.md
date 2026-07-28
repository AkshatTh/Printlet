# Step 1: Database Migration Guide

## 📋 What This Migration Does

### New Tables & Columns

**`profiles` table:**
- `id` (UUID) - Links to Supabase Auth user
- `full_name` (TEXT) - Student's full name
- `phone_number` (TEXT) - For WhatsApp notifications
- `role` (ENUM) - STUDENT or ADMIN
- Auto-timestamps: `created_at`, `updated_at`

**`orders` table updates:**
- `user_id` (UUID) - Links to profiles table
- `pickup_time` (TIMESTAMP) - Next working day at 12:30 PM
- `status` (ENUM) - PENDING → PAID → PRINTED → DELIVERED
- `file_name` (TEXT) - Original filename for reference

### Row Level Security (RLS)

**Students can:**
- ✅ View their own profile
- ✅ Update their own profile
- ✅ Insert their own orders
- ✅ View their own orders

**Admins can:**
- ✅ View all profiles
- ✅ Update all profiles
- ✅ View all orders
- ✅ Update all orders (mark as delivered)

**Service role (daemon) can:**
- ✅ Do everything (for print daemon automation)

## 🚀 How to Apply This Migration

### Step 1: Open Supabase Dashboard

1. Go to https://supabase.com/dashboard
2. Select your project: `guyhjoyylftcsbgwinef`
3. Click **SQL Editor** in the left sidebar

### Step 2: Run the Migration

1. Click **"New query"**
2. Copy the entire contents of `migration_auth_delivery.sql`
3. Paste into the SQL editor
4. Click **"Run"** or press `Ctrl+Enter`

### Step 3: Verify Tables Created

Go to **Table Editor** and verify you see:
- ✅ `profiles` table (new)
- ✅ `orders` table (updated with new columns)

### Step 4: Enable Email Auth

1. Go to **Authentication** → **Providers**
2. Enable **Email** provider (should already be enabled)
3. ✅ Keep **Confirm email** disabled for faster signups (optional)

### Step 5: Create Your Admin Account

**Option A: Via Supabase Dashboard (Recommended)**

1. Go to **Authentication** → **Users**
2. Click **"Add user"**
3. Create user with your email (e.g., `your-email@example.com`)
4. Copy the **User UID** (e.g., `123e4567-e89b-12d3-a456-426614174000`)

5. Go back to **SQL Editor** and run:
```sql
INSERT INTO profiles (id, full_name, phone_number, role)
VALUES (
    'YOUR_USER_UID_HERE'::uuid,  -- Replace with your actual UID
    'Your Name',                  -- Your full name
    '+919876543210',              -- Your WhatsApp number (with country code)
    'ADMIN'
) ON CONFLICT (id) DO UPDATE SET role = 'ADMIN';
```

**Option B: Sign Up via Frontend (After Step 2 implementation)**

1. Sign up normally through the app
2. Then manually update your role to ADMIN:
```sql
UPDATE profiles SET role = 'ADMIN' WHERE phone_number = '+919876543210';
```

## 🧪 Test the Migration

Run these queries to verify everything works:

```sql
-- Check profiles table structure
SELECT * FROM profiles LIMIT 1;

-- Check orders table has new columns
SELECT user_id, pickup_time, status FROM orders LIMIT 1;

-- Test RLS policies (should only show your own data)
SELECT * FROM profiles WHERE id = auth.uid();
```

## ⚠️ Important Notes

### Phone Number Format
Always use **international format** with country code:
- ✅ Correct: `+919876543210`
- ❌ Wrong: `9876543210`

This ensures WhatsApp links work correctly.

### Migration is Idempotent
This migration can be run multiple times safely. It uses:
- `IF NOT EXISTS` for table/column creation
- `ON CONFLICT` for inserts
- Conditional logic for enum types

### Existing Orders
The migration will:
- ✅ Keep all existing orders
- ✅ Migrate `payment_status` to new `status` column
- ⚠️ Leave `user_id` as NULL for old orders (they're anonymous)

## 🔧 Troubleshooting

### Error: "type user_role already exists"
This is fine - it means the migration ran partially before. Continue with the rest.

### Error: "column already exists"
This is also fine - the migration uses `IF NOT EXISTS` to handle this.

### Can't see tables in Table Editor
Wait 30 seconds and refresh the page. Supabase sometimes needs time to update the UI.

### RLS blocking queries
If you're testing with SQL Editor and getting "row level security" errors:
- SQL Editor runs as `postgres` role, which bypasses RLS
- Frontend queries run as `authenticated` role, which respects RLS
- This is expected behavior!

## ✅ Next Steps

After running this migration successfully:
1. ✅ Create your admin account
2. ✅ Verify you can query the tables
3. ✅ Ready for **Step 2: Authentication Flow implementation**

---

**Current Time**: July 28, 2026 - 3:36 AM IST

Let me know once you've:
- ✅ Run the migration in Supabase SQL Editor
- ✅ Created your admin profile
- ✅ Verified the tables exist

Then we'll proceed to **Step 2: Authentication Flow** (Login/Signup UI with Next.js)! 🚀
