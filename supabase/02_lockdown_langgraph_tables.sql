-- =====================================================================
-- FinGuardian AI - lock down LangGraph checkpoint tables
-- ---------------------------------------------------------------------
-- Run AFTER the FastAPI backend has started successfully at least once.
-- On startup, AsyncPostgresSaver.setup() creates these tables in the
-- public schema, and Supabase's default privileges expose new public
-- tables to the anon/authenticated API roles. Checkpoints contain the
-- full pipeline state (prices, news, scores), so close that door.
--
-- Safe to re-run. If a table does not exist yet, it is skipped with a
-- NOTICE - start the backend first, then run this again.
-- =====================================================================

DO $$
DECLARE
    t text;
    r text;
BEGIN
    FOREACH t IN ARRAY ARRAY['checkpoints', 'checkpoint_blobs', 'checkpoint_writes', 'checkpoint_migrations'] LOOP
        IF to_regclass('public.' || t) IS NULL THEN
            RAISE NOTICE 'Table public.% not found - start the backend once, then re-run this script.', t;
            CONTINUE;
        END IF;

        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

        FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
                EXECUTE format('REVOKE ALL ON public.%I FROM %I', t, r);
            END IF;
        END LOOP;

        RAISE NOTICE 'Locked down public.%', t;
    END LOOP;
END;
$$;

-- Verify: every FinGuardian table should show rls_enabled = true
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY 1;
