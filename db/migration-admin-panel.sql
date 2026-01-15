-- Admin & Tickets Migration
-- Enable RLS updates/inserts for admin functionality

-- 1. Updates to Profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active'; -- active, banned
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_login TIMESTAMP WITH TIME ZONE;

-- 2. Tickets Table
CREATE TABLE IF NOT EXISTS tickets (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES profiles(id),
    subject VARCHAR(255) NOT NULL,
    description TEXT,
    urgency VARCHAR(20) DEFAULT 'medium',
    status VARCHAR(20) DEFAULT 'open', -- open, in_progress, closed
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Revenue Tracking (Simple)
-- We'll track invoices/payments
CREATE TABLE IF NOT EXISTS invoices (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES profiles(id),
    amount DECIMAL(10, 2) NOT NULL,
    status VARCHAR(20) DEFAULT 'paid',
    reference_id VARCHAR(100), -- Stripe/Gateway ID
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Enable RLS on tickets
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;

-- Allow users to view/create their own tickets
CREATE POLICY "Users can view own tickets" ON tickets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create tickets" ON tickets FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Allow admins to view all tickets (This requires a logic where is_admin is checked)
-- For simplicity in this 'fix', we might bypass RLS in the admin API by using the service key 
-- OR by defining a policy dependent on the profiles table
-- CREATE POLICY "Admins can view all tickets" ON tickets FOR SELECT USING (
--     EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
-- );
-- Note: Recursive policies can be dangerous/slow. 
-- Best practice: Users view own. Admin API uses service key or is_admin check in application logic if RLS is off for reading (or set to public for specific secure endpoints).
-- We will proceed with application-level security for the admin dashboard for now, 
-- or ensure the admin user has the right permissions in Supabase.

