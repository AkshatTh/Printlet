-- Step 1: Create user role enum
CREATE TYPE user_role AS ENUM ('STUDENT', 'ADMIN');

-- Step 2: Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    role user_role NOT NULL DEFAULT 'STUDENT',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Step 3: Add order status enum (extending existing payment_status)
-- First, check if we need to add DELIVERED status
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status') THEN
        CREATE TYPE order_status AS ENUM ('PENDING', 'PAID', 'PRINTED', 'DELIVERED');
    END IF;
END $$;

-- Step 4: Update orders table to add new columns
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS pickup_time TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS status order_status DEFAULT 'PENDING',
    ADD COLUMN IF NOT EXISTS file_name TEXT;

-- Migrate existing payment_status to status column (if needed)
UPDATE orders
SET status = CASE
    WHEN payment_status = 'PENDING' THEN 'PENDING'::order_status
    WHEN payment_status = 'PAID' THEN 'PAID'::order_status
    WHEN payment_status = 'PRINTED' THEN 'PRINTED'::order_status
    ELSE 'PENDING'::order_status
END
WHERE status IS NULL;

-- Step 5: Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON profiles(phone_number);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_pickup_time ON orders(pickup_time);

-- Step 6: Enable Row Level Security on profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Step 7: RLS Policies for profiles table

-- Allow users to read their own profile
CREATE POLICY "Users can view own profile"
    ON profiles
    FOR SELECT
    TO authenticated
    USING (auth.uid() = id);

-- Allow users to insert their own profile (after signup)
CREATE POLICY "Users can insert own profile"
    ON profiles
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = id);

-- Allow users to update their own profile
CREATE POLICY "Users can update own profile"
    ON profiles
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Allow admins to read all profiles
CREATE POLICY "Admins can view all profiles"
    ON profiles
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'ADMIN'
        )
    );

-- Allow admins to update all profiles
CREATE POLICY "Admins can update all profiles"
    ON profiles
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'ADMIN'
        )
    );

-- Step 8: Update RLS Policies for orders table

-- Drop old policies that conflict
DROP POLICY IF EXISTS "Allow public inserts" ON orders;
DROP POLICY IF EXISTS "Allow public select by id" ON orders;

-- Allow authenticated users to insert their own orders
CREATE POLICY "Users can insert own orders"
    ON orders
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- Allow users to view their own orders
CREATE POLICY "Users can view own orders"
    ON orders
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Allow admins to view all orders
CREATE POLICY "Admins can view all orders"
    ON orders
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'ADMIN'
        )
    );

-- Allow admins to update all orders
CREATE POLICY "Admins can update all orders"
    ON orders
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'ADMIN'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'ADMIN'
        )
    );

-- Keep service role policies for daemon access
-- (These already exist from previous schema)

-- Step 9: Create trigger to auto-update updated_at on profiles
CREATE OR REPLACE FUNCTION update_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_profiles_updated_at();

-- Step 10: Create a function to check if user is admin
CREATE OR REPLACE FUNCTION is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM profiles
        WHERE id = user_id
        AND role = 'ADMIN'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 11: Add helpful comments
COMMENT ON TABLE profiles IS 'User profiles linked to Supabase Auth';
COMMENT ON COLUMN profiles.phone_number IS 'Required for WhatsApp delivery notifications';
COMMENT ON COLUMN profiles.role IS 'STUDENT for regular users, ADMIN for delivery management';
COMMENT ON COLUMN orders.user_id IS 'Links order to the user who placed it';
COMMENT ON COLUMN orders.pickup_time IS 'Calculated pickup time (next working day at 12:30 PM)';
COMMENT ON COLUMN orders.status IS 'Order lifecycle: PENDING → PAID → PRINTED → DELIVERED';

-- Step 12: Sample data (optional - for testing)
-- Uncomment to create a test admin user (replace with your actual auth user ID)
/*
INSERT INTO profiles (id, full_name, phone_number, role)
VALUES (
    'YOUR_AUTH_USER_ID_HERE'::uuid,
    'Admin User',
    '+919876543210',
    'ADMIN'
) ON CONFLICT (id) DO UPDATE SET role = 'ADMIN';
*/
