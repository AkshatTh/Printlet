-- =========================================================================
-- PRINTLET SUPABASE DATABASE REPAIR & AUTO-SYNC TRIGGER MIGRATION
-- Run this script in your Supabase SQL Editor (https://supabase.com/dashboard)
-- =========================================================================

-- 1. Ensure public.profiles table exists and add any missing columns cleanly
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    full_name TEXT,
    phone_number TEXT,
    role TEXT DEFAULT 'STUDENT',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone_number TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'STUDENT';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 2. Backfill profiles for all existing Auth users with full_name & phone_number
INSERT INTO public.profiles (id, email, full_name, phone_number, role)
SELECT 
    id,
    email,
    COALESCE(raw_user_meta_data->>'full_name', split_part(email, '@', 1)),
    COALESCE(raw_user_meta_data->>'phone_number', phone, ''),
    'STUDENT'
FROM auth.users
ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = CASE 
        WHEN public.profiles.full_name IS NULL OR public.profiles.full_name = '' OR public.profiles.full_name = 'Student User' 
        THEN EXCLUDED.full_name 
        ELSE public.profiles.full_name 
    END,
    phone_number = CASE 
        WHEN public.profiles.phone_number IS NULL OR public.profiles.phone_number = '' OR public.profiles.phone_number = 'No Phone' 
        THEN EXCLUDED.phone_number 
        ELSE public.profiles.phone_number 
    END;

-- 3. Automatic Trigger: Whenever a user signs up or updates in Supabase Auth,
-- auto-sync their full_name and phone_number into public.profiles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, phone_number, role)
    VALUES (
        new.id,
        new.email,
        COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
        COALESCE(new.raw_user_meta_data->>'phone_number', new.phone, ''),
        'STUDENT'
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), public.profiles.full_name),
        phone_number = COALESCE(NULLIF(EXCLUDED.phone_number, ''), public.profiles.phone_number),
        updated_at = NOW();
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT OR UPDATE ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. Enable RLS and grant service permissions
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public profiles read policy" ON public.profiles;
CREATE POLICY "Public profiles read policy" ON public.profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

GRANT ALL ON public.profiles TO service_role;
GRANT ALL ON public.profiles TO postgres;
