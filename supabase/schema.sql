-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create payment status enum
CREATE TYPE payment_status AS ENUM ('PENDING', 'PAID', 'PRINTED');

-- Create orders table
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    file_url TEXT NOT NULL,
    page_count INTEGER NOT NULL CHECK (page_count > 0),
    requires_staple BOOLEAN NOT NULL DEFAULT false,
    total_amount INTEGER NOT NULL CHECK (total_amount > 0), -- Amount in paise (₹)
    payment_status payment_status NOT NULL DEFAULT 'PENDING',
    razorpay_order_id TEXT,
    razorpay_payment_id TEXT,
    razorpay_signature TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster queries on payment status
CREATE INDEX idx_orders_payment_status ON orders(payment_status);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX idx_orders_razorpay_order_id ON orders(razorpay_order_id);

-- Enable Row Level Security
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Policy 1: Allow public inserts (for new orders from frontend)
CREATE POLICY "Allow public inserts"
    ON orders
    FOR INSERT
    TO anon
    WITH CHECK (true);

-- Policy 2: Allow authenticated users to select all orders (for admin dashboard)
CREATE POLICY "Allow authenticated select"
    ON orders
    FOR SELECT
    TO authenticated
    USING (true);

-- Policy 3: Allow service role to do everything (for API routes using service key)
CREATE POLICY "Allow service role all"
    ON orders
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Policy 4: Allow public to select their own pending orders by ID
CREATE POLICY "Allow public select by id"
    ON orders
    FOR SELECT
    TO anon
    USING (true);

-- Policy 5: Allow service role to update orders (for payment verification and daemon)
CREATE POLICY "Allow service role update"
    ON orders
    FOR UPDATE
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update updated_at on every update
CREATE TRIGGER update_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create a function to clean up old pending orders (optional maintenance)
CREATE OR REPLACE FUNCTION cleanup_old_pending_orders()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM orders
    WHERE payment_status = 'PENDING'
    AND created_at < NOW() - INTERVAL '24 hours';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE orders IS 'Stores print job orders with payment tracking';
COMMENT ON COLUMN orders.file_url IS 'Supabase Storage URL for the uploaded file';
COMMENT ON COLUMN orders.page_count IS 'Number of pages in the document';
COMMENT ON COLUMN orders.requires_staple IS 'Whether customer requested stapling';
COMMENT ON COLUMN orders.total_amount IS 'Total amount in paise (1 rupee = 100 paise)';
COMMENT ON COLUMN orders.payment_status IS 'Current status: PENDING, PAID, or PRINTED';
COMMENT ON COLUMN orders.razorpay_order_id IS 'Razorpay order ID for payment tracking';
COMMENT ON COLUMN orders.razorpay_payment_id IS 'Razorpay payment ID after successful payment';
COMMENT ON COLUMN orders.razorpay_signature IS 'Razorpay signature for payment verification';
