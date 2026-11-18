-- =====================================================================
-- FinGuardian AI - Supabase schema (fresh project)
-- ---------------------------------------------------------------------
-- Run ONCE in: Supabase Dashboard -> SQL Editor -> New query -> Run.
--
-- What it creates
--   * users            - accounts + roles (custom JWT auth in FastAPI)
--   * analyses         - one row per pipeline run (queryable history)
--   * pipeline_events  - durable audit trail (replaces Redis Streams)
--   * set_updated_at() - trigger so updated_at is always correct
--   * alembic_version  - stamped to the latest revision, so future
--                        `alembic upgrade head` runs continue from here
--
-- LangGraph's checkpoint tables (checkpoints, checkpoint_blobs,
-- checkpoint_writes, checkpoint_migrations) are NOT created here: the
-- backend creates them itself on first start (AsyncPostgresSaver.setup()).
-- After that first start, run 02_lockdown_langgraph_tables.sql.
--
-- The script is idempotent: running it twice is safe.
-- It is equivalent to running every Alembic migration up to
-- revision c4e8f1a2b9d0 (supabase_hardening).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- Shared trigger function: keep updated_at honest even for raw SQL
-- updates (SQLAlchemy's onupdate only fires for ORM updates).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
    id               serial       PRIMARY KEY,
    email            varchar(255) NOT NULL,
    hashed_password  varchar(255) NOT NULL,
    is_active        boolean      NOT NULL DEFAULT true,
    role             varchar(50)  NOT NULL DEFAULT 'user',
    created_at       timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT ck_users_role        CHECK (role IN ('user', 'admin')),
    CONSTRAINT ck_users_email_lower CHECK (email = lower(email))
);

-- Emails are stored lower-cased (enforced above), so a plain unique
-- index is enough to stop "A@x.com" and "a@x.com" becoming two accounts.
CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email ON public.users (email);

-- ---------------------------------------------------------------------
-- analyses
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.analyses (
    thread_id              varchar(64)      PRIMARY KEY,
    request_id             varchar(64)      NOT NULL,
    symbol                 varchar(20)      NOT NULL,
    asset_type             varchar(20)      NOT NULL DEFAULT 'stock',
    status                 varchar(20)      NOT NULL,

    risk_score             double precision,
    risk_factors           jsonb,
    fraud_flag             boolean,
    fraud_confidence       double precision,
    shap_explanation       jsonb,
    requires_human_review  boolean,
    human_decision         varchar(20),
    outlook                varchar(20),
    outlook_rationale      text,
    final_report           text,
    alerts_sent            jsonb,

    -- Richer payload for the dashboard (charts, news list, agent trace)
    sentiment_score        double precision,
    market_snapshot        jsonb,
    news_articles          jsonb,
    agent_log              jsonb,

    requested_by           integer REFERENCES public.users (id) ON DELETE SET NULL,
    reviewed_by            integer REFERENCES public.users (id) ON DELETE SET NULL,
    reviewed_at            timestamptz,

    created_at             timestamptz      NOT NULL DEFAULT now(),
    updated_at             timestamptz      NOT NULL DEFAULT now(),

    CONSTRAINT ck_analyses_status           CHECK (status IN ('pending_review', 'completed')),
    CONSTRAINT ck_analyses_asset_type       CHECK (asset_type IN ('stock', 'crypto', 'forex')),
    CONSTRAINT ck_analyses_outlook          CHECK (outlook IS NULL OR outlook IN ('positive_signals', 'mixed_signals', 'negative_signals')),
    CONSTRAINT ck_analyses_human_decision   CHECK (human_decision IS NULL OR human_decision IN ('approved', 'rejected')),
    CONSTRAINT ck_analyses_risk_score       CHECK (risk_score IS NULL OR risk_score BETWEEN 0 AND 100),
    CONSTRAINT ck_analyses_fraud_confidence CHECK (fraud_confidence IS NULL OR fraud_confidence BETWEEN 0 AND 1),
    CONSTRAINT ck_analyses_review_pair      CHECK (reviewed_by IS NULL OR reviewed_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS ix_analyses_symbol ON public.analyses (symbol);
CREATE INDEX IF NOT EXISTS ix_analyses_status ON public.analyses (status);
-- "My history, newest first" - the most frequent query in the app
CREATE INDEX IF NOT EXISTS ix_analyses_requested_by_created
    ON public.analyses (requested_by, created_at DESC);
-- Admin review queue: only ever scans the (small) pending set
CREATE INDEX IF NOT EXISTS ix_analyses_pending_created
    ON public.analyses (created_at) WHERE status = 'pending_review';
-- FK lookups / ON DELETE SET NULL on reviewer
CREATE INDEX IF NOT EXISTS ix_analyses_reviewed_by ON public.analyses (reviewed_by);

DROP TRIGGER IF EXISTS trg_analyses_updated_at ON public.analyses;
CREATE TRIGGER trg_analyses_updated_at
    BEFORE UPDATE ON public.analyses
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- pipeline_events  (replaces Redis Streams as the durable audit trail)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pipeline_events (
    id          bigint       GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    stream      varchar(64)  NOT NULL,
    thread_id   varchar(64),
    request_id  varchar(64),
    symbol      varchar(20),
    payload     jsonb        NOT NULL DEFAULT '{}'::jsonb,
    created_at  timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_pipeline_events_stream_created
    ON public.pipeline_events (stream, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_pipeline_events_thread
    ON public.pipeline_events (thread_id);

-- ---------------------------------------------------------------------
-- Alembic bookkeeping: mark this database as already at head
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.alembic_version (
    version_num varchar(32) NOT NULL,
    CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)
);
DELETE FROM public.alembic_version;
INSERT INTO public.alembic_version (version_num) VALUES ('c4e8f1a2b9d0');

-- ---------------------------------------------------------------------
-- Security: these tables must NEVER be reachable through Supabase's
-- auto-generated REST/GraphQL API (anon / authenticated keys).
-- The FastAPI backend connects as the table owner (postgres), which
-- bypasses RLS, so enabling RLS with no policies = "API sees nothing,
-- backend sees everything".
-- ---------------------------------------------------------------------
ALTER TABLE public.users            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analyses         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alembic_version  ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    r text;
BEGIN
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
            EXECUTE format('REVOKE ALL ON public.users, public.analyses, public.pipeline_events, public.alembic_version FROM %I', r);
            EXECUTE format('REVOKE ALL ON SEQUENCE public.users_id_seq, public.pipeline_events_id_seq FROM %I', r);
            EXECUTE format('REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM %I', r);
        END IF;
    END LOOP;
END;
$$;

COMMIT;

-- Quick sanity check (should list 4 tables, all with rls_enabled = true)
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('users', 'analyses', 'pipeline_events', 'alembic_version')
ORDER BY 1;
