# Supabase Storage Setup Instructions

## 1. Create Storage Bucket

1. Go to your Supabase project dashboard
2. Navigate to **Storage** in the left sidebar
3. Click **"New bucket"**
4. Configure the bucket:
   - **Name**: `print-jobs`
   - **Public bucket**: ❌ **No** (keep it private)
   - **File size limit**: `52428800` (50 MB)
   - **Allowed MIME types**: 
     - `application/pdf`
     - `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
     - `image/png`
     - `image/jpeg`

## 2. Set Up Storage Policies

After creating the bucket, set up Row Level Security policies for the `print-jobs` bucket.

Go to **Storage** → **Policies** → **print-jobs** and add these policies:

### Policy 1: Allow Public Uploads (Anonymous users can upload)

```sql
CREATE POLICY "Allow public uploads"
ON storage.objects
FOR INSERT
TO anon
WITH CHECK (bucket_id = 'print-jobs');
```

### Policy 2: Allow Service Role Full Access

```sql
CREATE POLICY "Allow service role full access"
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id = 'print-jobs')
WITH CHECK (bucket_id = 'print-jobs');
```

### Policy 3: Allow Authenticated Users to Read

```sql
CREATE POLICY "Allow authenticated read"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'print-jobs');
```

### Policy 4: Allow Service Role to Delete (for cleanup after printing)

```sql
CREATE POLICY "Allow service role delete"
ON storage.objects
FOR DELETE
TO service_role
USING (bucket_id = 'print-jobs');
```

## 3. Verify Setup

After creating the bucket and policies, verify:

✅ Bucket name is exactly `print-jobs`  
✅ Bucket is **private** (not public)  
✅ File size limit is 50 MB  
✅ All 4 storage policies are active  

## 4. Get Your Supabase Credentials

1. Go to **Project Settings** → **API**
2. Copy these values to your `.env.local`:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` ⚠️ Keep this secret!

## Storage Cleanup Strategy

To stay within the 1GB free tier:

- Files are automatically deleted after printing (daemon calls `/api/daemon/complete`)
- Average file size: ~500 KB per PDF
- With auto-cleanup: ~2000 files can be processed before hitting limits
- Old pending orders (unpaid > 24 hours) can be cleaned up with: `SELECT cleanup_old_pending_orders();`

## Troubleshooting

**Issue**: "new row violates row-level security policy"  
**Solution**: Make sure you're using the correct Supabase key (service_role for server-side, anon for client-side)

**Issue**: "File size exceeds bucket limit"  
**Solution**: Increase the file size limit in bucket settings or reject files > 50MB in frontend

**Issue**: "Storage bucket not found"  
**Solution**: Double-check the bucket name is exactly `print-jobs` (no spaces, lowercase)
