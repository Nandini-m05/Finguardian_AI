# Running FinGuardian AI on Supabase (no Docker)

Before: Docker Desktop running Postgres + Redis + Nginx, plus four terminals
(API, Celery worker, Streamlit, Docker).
Now: **Supabase hosts the database. You run two processes: the API and the
dashboard.** Redis, Celery and Nginx are optional and off by default.

| Old (Docker) | New |
|---|---|
| `pgvector/pgvector` container | Supabase Postgres (cloud) |
| Redis Streams audit trail | `pipeline_events` table in Supabase |
| Celery worker + Redis broker for email | Email sent from the API in a background thread (`ALERT_DELIVERY=inline`) |
| Nginx rate limiting | `slowapi` limits on `/login`, `/register`, `/analyze` |

---

## 1. Create the Supabase project

1. Go to <https://supabase.com/dashboard> → **New project**.
2. Region: **South Asia (Mumbai)** if you are in India (lowest latency).
3. Set a **database password** and save it somewhere safe. Prefer letters and
   digits only — special characters must be URL-encoded later.
4. Wait for the project to finish provisioning.

## 2. Create the schema

1. Dashboard → **SQL Editor** → **New query**.
2. Paste the whole of [`supabase/01_schema.sql`](supabase/01_schema.sql) → **Run**.
3. The last result should list 4 tables (`alembic_version`, `analyses`,
   `pipeline_events`, `users`), all with `rls_enabled = true`.

This is equivalent to running every Alembic migration, and it stamps the
database at the latest revision, so `alembic upgrade head` will work for any
future migration.

> Why RLS with no policies? Supabase automatically exposes tables in `public`
> through its REST API to anyone holding the project's anon key. Our backend
> connects as the table owner (`postgres`), which bypasses RLS, so this setting
> means: **the backend sees everything, the public API sees nothing.**

## 3. Get the connection string

1. Dashboard → **Connect** (top bar) → **Session pooler**.
2. Copy the URI. It looks like:

   ```
   postgresql://postgres.abcdefghijkl:[YOUR-PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:5432/postgres
   ```

3. Turn it into the backend's `DATABASE_URL`:
   * change `postgresql://` → `postgresql+asyncpg://`
   * put in your password (URL-encode `@ # / : % ?` — e.g. `@` → `%40`)
   * add `?ssl=require` at the end

   ```
   DATABASE_URL=postgresql+asyncpg://postgres.abcdefghijkl:MyPassw0rd@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?ssl=require
   ```

**Use the Session pooler (port 5432), not the others:**

| Option | Use it? | Why |
|---|---|---|
| Direct connection `db.<ref>.supabase.co:5432` | No | IPv6-only unless you buy the IPv4 add-on; most home/college networks fail with "Network is unreachable" |
| **Session pooler** `…pooler.supabase.com:5432` | **Yes** | IPv4, supports prepared statements (LangGraph's checkpointer needs them) |
| Transaction pooler `…pooler.supabase.com:6543` | No | No prepared statements; the API refuses to start with it and tells you why |

`LANGGRAPH_DB_URL` can stay empty — the backend derives the psycopg-style URL
(`postgresql://…?sslmode=require`) from `DATABASE_URL` automatically.

## 4. Configure the backend

```bash
cp .env.example .env          # Windows: copy .env.example .env
python -c "import secrets; print(secrets.token_urlsafe(48))"   # paste as JWT_SECRET
```

Edit `.env`: set `DATABASE_URL` and `JWT_SECRET`. Everything else has a
working default. Resend is optional — without `RESEND_API_KEY` and
`ALERT_RECIPIENT_EMAIL`, alerts are still recorded but not emailed.

## 5. Install and run

Python **3.11** (that is what CI uses).

```bash
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS / Linux

pip install -r requirements-dev.txt

# Terminal 1 - API
uvicorn app.main:app --reload

# Terminal 2 - dashboard (Node 20.19+ / 22 LTS)
cd frontend
cp .env.example .env.local      # VITE_API_BASE_URL=http://localhost:8000
npm install
npm run dev                      # http://localhost:5173
```

First start takes a minute: it downloads FinBERT (~440 MB, cached afterwards)
and creates LangGraph's checkpoint tables in Supabase. Set `PRELOAD_MODELS=false`
for faster restarts while developing (the first analysis is then slower).

Check: <http://localhost:8000/health> should return `"database": "ok"`.
API docs: <http://localhost:8000/docs>.

## 6. Lock down LangGraph's tables (once, after the first start)

SQL Editor → run [`supabase/02_lockdown_langgraph_tables.sql`](supabase/02_lockdown_langgraph_tables.sql).
LangGraph created `checkpoints`, `checkpoint_blobs`, `checkpoint_writes`,
`checkpoint_migrations`; this hides them from the public API too.

## 7. Create admins

Register two accounts in the dashboard, then in the SQL Editor:

```sql
UPDATE public.users SET role = 'admin' WHERE email = 'you@example.com';
```

Log out and back in. You need **two** admins to test review end to end — an
admin cannot review their own flagged case. More queries (deactivate a user,
review audit, storage) are in [`supabase/04_admin_and_checks.sql`](supabase/04_admin_and_checks.sql).

## 8. Keep storage under the free-tier limit (recommended)

LangGraph saves a checkpoint after every node of every run and never deletes
them. Run [`supabase/03_maintenance.sql`](supabase/03_maintenance.sql) once to
add `public.finguardian_cleanup()`, then either call it by hand:

```sql
SELECT * FROM public.finguardian_cleanup();     -- completed runs > 30 days, events > 90 days
```

or enable the `pg_cron` extension and schedule it (instructions in the file).

---

## Moving data from the old Docker database (optional)

If you have users/analyses in the old local Postgres you want to keep:

```bash
# 1. bring the OLD database to the new schema (old .env pointing at Docker)
alembic upgrade head

# 2. dump only the data of the app tables
pg_dump "postgresql://finguardian:finguardian_dev_password@localhost:5432/finguardian_db" \
  --data-only --column-inserts -t users -t analyses -t pipeline_events > data.sql

# 3. load into Supabase (session pooler URI, plain postgresql:// scheme)
psql "postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require" -f data.sql
```

Then in the SQL Editor fix the ID counter:
`SELECT setval('public.users_id_seq', (SELECT max(id) FROM public.users));`

Old checkpoints are not worth moving: completed runs are fully stored in
`analyses`; a case that was still pending review must be re-run.

---

## Optional: Redis / Celery

Only if you want the old architecture back (e.g. to demo a task queue):

```bash
pip install -r requirements-optional.txt
```

`.env`: `REDIS_URL=rediss://…` (a free Upstash Redis works, no Docker) and
`ALERT_DELIVERY=celery`, then run
`celery -A app.celery_app worker --loglevel=info --pool=solo`.
With `REDIS_URL` set, every pipeline event is also mirrored to a Redis Stream.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `Network is unreachable` / `could not translate host name` | You used the direct `db.<ref>.supabase.co` host on an IPv4 network. Use the Session pooler string. |
| `Tenant or user not found` | Pooler username must be `postgres.<project-ref>`, and the region in the host must match your project. Copy the string from **Connect** again. |
| `password authentication failed` | Wrong password, or special characters not URL-encoded. Reset it under Project Settings → Database. |
| `prepared statement "…" already exists` | You are on port 6543 (transaction pooler). Switch to the Session pooler (5432). |
| `MaxClientsInSessionMode` / too many clients | Lower `DB_POOL_SIZE` / `DB_MAX_OVERFLOW`, and don't run several copies of the API. |
| `ValueError: JWT_SECRET must be at least 32 characters` | Generate one with the command in step 4. |
| `ProactorEventLoop` errors on Windows | Run with `uvicorn app.main:app` (the app sets the selector loop itself); don't start it through a different runner. |
| Project stops responding after a quiet week | Free projects are paused after a period of inactivity. Restore it from the dashboard. |
