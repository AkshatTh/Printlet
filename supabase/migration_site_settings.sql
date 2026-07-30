-- Run this in your Supabase SQL Editor to create site_settings table for permanent outage status persistence:

CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS and grant service role full access
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

-- Insert default site_status row
INSERT INTO site_settings (key, value)
VALUES (
  'site_status',
  '{"is_closed": false, "message": "Printing service is temporarily paused due to maintenance or power outage. Your order can still be uploaded and paid for, but next-day delivery timeline will resume as soon as service reopens."}'::jsonb
)
ON CONFLICT (key) DO NOTHING;
