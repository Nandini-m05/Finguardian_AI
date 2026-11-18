-- =====================================================================
-- FinGuardian AI - admin setup and health checks
-- Run pieces of this in the Supabase SQL Editor as needed.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Promote an account to admin
--    Register the account from the app first, then run this.
--    Emails are stored lower-case, so type it in lower case.
--    The user must log out and log back in afterwards.
-- ---------------------------------------------------------------------
-- UPDATE public.users SET role = 'admin' WHERE email = 'you@example.com';

-- Separation of duties needs at least TWO admins to test the review
-- flow end to end (an admin cannot review their own submission).

-- ---------------------------------------------------------------------
-- 2. Deactivate / reactivate an account (blocks login and API access)
-- ---------------------------------------------------------------------
-- UPDATE public.users SET is_active = false WHERE email = 'someone@example.com';
-- UPDATE public.users SET is_active = true  WHERE email = 'someone@example.com';

-- ---------------------------------------------------------------------
-- 3. Health checks
-- ---------------------------------------------------------------------

-- Schema version (should be c4e8f1a2b9d0)
SELECT version_num AS alembic_head FROM public.alembic_version;

-- Accounts by role
SELECT role, is_active, count(*) FROM public.users GROUP BY 1, 2 ORDER BY 1, 2;

-- Analyses by status / outlook
SELECT status, outlook, count(*) FROM public.analyses GROUP BY 1, 2 ORDER BY 1, 2;

-- Review queue (what admins see), oldest first
SELECT a.thread_id, a.symbol, a.risk_score, a.fraud_confidence, u.email AS requested_by, a.created_at
FROM public.analyses a
LEFT JOIN public.users u ON u.id = a.requested_by
WHERE a.status = 'pending_review'
ORDER BY a.created_at;

-- Who reviewed what (audit trail for separation of duties)
SELECT a.thread_id, a.symbol, a.human_decision, r.email AS reviewed_by, a.reviewed_at
FROM public.analyses a
JOIN public.users r ON r.id = a.reviewed_by
ORDER BY a.reviewed_at DESC
LIMIT 50;

-- Latest audit-trail events
SELECT stream, symbol, thread_id, payload, created_at
FROM public.pipeline_events
ORDER BY created_at DESC
LIMIT 50;

-- Any public table still reachable from the REST API? (should return 0 rows)
SELECT c.relname AS exposed_table
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
