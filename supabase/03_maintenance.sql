-- =====================================================================
-- FinGuardian AI - storage maintenance (Supabase free tier = 500 MB)
-- ---------------------------------------------------------------------
-- LangGraph writes a checkpoint after EVERY node of EVERY run, and
-- never deletes them. A few hundred analyses is enough to make
-- checkpoint_blobs the largest table in the project. Completed runs no
-- longer need their checkpoints (the analyses row keeps the result), so
-- this script adds a cleanup function you can run by hand or on a
-- schedule.
--
-- Run 02_lockdown_langgraph_tables.sql first (the tables must exist).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Cleanup function
--    * deletes checkpoints of COMPLETED analyses older than N days
--      (pending_review runs are never touched - they must stay resumable)
--    * deletes pipeline_events older than M days
--    Returns how many checkpoint threads and events were removed.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finguardian_cleanup(
    checkpoint_days integer DEFAULT 30,
    event_days      integer DEFAULT 90
)
RETURNS TABLE (threads_cleaned bigint, events_deleted bigint)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_ids     text[];
    v_threads bigint := 0;
    v_events  bigint := 0;
BEGIN
    SELECT coalesce(array_agg(a.thread_id::text), ARRAY[]::text[])
    INTO v_ids
    FROM public.analyses a
    WHERE a.status = 'completed'
      AND a.updated_at < now() - make_interval(days => checkpoint_days);

    v_threads := cardinality(v_ids);

    IF v_threads > 0 AND to_regclass('public.checkpoint_writes') IS NOT NULL THEN
        DELETE FROM public.checkpoint_writes WHERE thread_id = ANY (v_ids);
        DELETE FROM public.checkpoint_blobs  WHERE thread_id = ANY (v_ids);
        DELETE FROM public.checkpoints       WHERE thread_id = ANY (v_ids);
    END IF;

    DELETE FROM public.pipeline_events
    WHERE created_at < now() - make_interval(days => event_days);
    GET DIAGNOSTICS v_events = ROW_COUNT;

    RETURN QUERY SELECT v_threads, v_events;
END;
$$;

-- Only the backend/owner may call it - never the public API roles.
REVOKE ALL ON FUNCTION public.finguardian_cleanup(integer, integer) FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON FUNCTION public.finguardian_cleanup(integer, integer) FROM anon, authenticated;
    END IF;
END;
$$;

-- Run it by hand any time:
--   SELECT * FROM public.finguardian_cleanup();          -- defaults 30 / 90 days
--   SELECT * FROM public.finguardian_cleanup(7, 30);     -- more aggressive

-- ---------------------------------------------------------------------
-- 2. OPTIONAL: run it nightly with pg_cron
--    Dashboard -> Database -> Extensions -> enable "pg_cron" first,
--    then uncomment and run the line below (02:30 UTC = 08:00 IST).
-- ---------------------------------------------------------------------
-- SELECT cron.schedule('finguardian-nightly-cleanup', '30 2 * * *',
--                      $$SELECT public.finguardian_cleanup()$$);

-- ---------------------------------------------------------------------
-- 3. Storage report - what is using space right now
-- ---------------------------------------------------------------------
SELECT c.relname                                         AS table_name,
       pg_size_pretty(pg_total_relation_size(c.oid))     AS total_size,
       c.reltuples::bigint                               AS approx_rows
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY pg_total_relation_size(c.oid) DESC;
