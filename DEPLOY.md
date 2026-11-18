# Deploying FinGuardian AI for free

```
Browser ──► Cloudflare Pages (React frontend, static)
              │  HTTPS, VITE_API_BASE_URL
              ▼
           Google Cloud Run (this repo's Docker image: FastAPI + LangGraph + FinBERT + XGBoost)
              │  Session pooler, SSL
              ▼
           Supabase Postgres (users, analyses, events, LangGraph checkpoints)
```

| Piece | Service | Free allowance (check the provider's page before relying on it) |
|---|---|---|
| Frontend | Cloudflare Pages | Static hosting |
| Backend | Google Cloud Run | Request-based billing: 180,000 vCPU-seconds, 360,000 GiB-seconds and 2 million requests per month |
| Image | Docker Hub (public repo) | Free; avoids Google Artifact Registry storage beyond its 0.5 GB free tier |
| Image build | GitHub Actions | Free on public repos |
| Database | Supabase Free | 500 MB database; project pauses after 7 days without activity |

At 1 vCPU + 2 GiB, the Cloud Run allowance is about **50 hours of active
instance time a month**. One analysis takes 10–60 s, so a demo, testing and the
viva fit comfortably. The service scales to zero when nobody uses it.

Nothing in the backend code or the models changes for this. The only new
files are `Dockerfile`, `.dockerignore`, `.github/workflows/docker-publish.yml`
and this guide.

---

## 0. Before you start

* Supabase is set up and `supabase/01_schema.sql` has been run ([SUPABASE_SETUP.md](SUPABASE_SETUP.md)).
* The backend works locally (`uvicorn app.main:app` → `/health` says `"database": "ok"`).
* Note your Supabase project's **region** (Project Settings → General). Put Cloud Run in
  the same part of the world: LangGraph writes to the database after every agent, so a
  backend in the US talking to a database in Mumbai adds seconds to every analysis.
  Supabase "South Asia (Mumbai)" ↔ Cloud Run `asia-south1` (Mumbai).

## 1. Build and publish the image (once per backend change)

**Option A — GitHub Actions (no local Docker needed, recommended)**

1. Create a free account at <https://hub.docker.com>.
2. Docker Hub → Account settings → Personal access tokens → generate one with Read & Write.
3. GitHub repo → Settings → Secrets and variables → Actions → add
   `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN`.
4. Push to `main` (or run the workflow from the Actions tab). The image appears as
   `<username>/finguardian-api:latest`, public.

**Option B — your own machine (Docker Desktop)**

```bash
docker build -t <username>/finguardian-api:latest .
docker login
docker push <username>/finguardian-api:latest
```

Test it locally first if you like: `docker run --env-file .env -p 8080:8080 <username>/finguardian-api:latest`
then open <http://localhost:8080/health>. (The image is large, about 2–3 GB, because of torch and FinBERT.)

The image holds code and the public FinBERT model only. `.env` is excluded by
`.dockerignore`; secrets go into Cloud Run's settings in step 3.

## 2. Google Cloud project (once)

1. <https://console.cloud.google.com> → create a project, e.g. `finguardian`.
2. Billing → link a billing account. Google asks for a card even for the free tier.
3. **Billing → Budgets & alerts → Create budget**: ₹100 for the project, email alerts
   at 50 % / 90 % / 100 %. This is your safety net.
4. Enable the **Cloud Run Admin API** (search "Cloud Run" → it offers to enable it).

## 3. Deploy to Cloud Run

### From the console

Cloud Run → **Deploy container** → Service:

| Setting | Value | Why |
|---|---|---|
| Container image URL | `docker.io/<username>/finguardian-api:latest` | Pulled straight from Docker Hub |
| Region | same area as Supabase (e.g. `asia-south1`) | Database latency |
| Authentication | Allow public access | The API does its own JWT auth |
| Billing | **Request-based** | This is the mode the free allowance above covers |
| Min instances / Max instances | `0` / `1` | Scale to zero; never more than one copy (keeps cost and the in-memory rate limiter predictable) |
| Container port | `8080` | Matches the Dockerfile |
| Memory / CPU | `2 GiB` / `1` | torch + FinBERT need more than 1 GiB |
| Request timeout | `300` seconds | An analysis can take up to a minute; cold starts add more |
| Max concurrent requests | `4` | One vCPU shared by FinBERT |

**Variables & secrets** tab — add:

| Name | Value |
|---|---|
| `DATABASE_URL` | your Supabase session-pooler URL (`postgresql+asyncpg://…:5432/postgres?ssl=require`) |
| `JWT_SECRET` | 32+ random characters |
| `CORS_ORIGINS` | `https://<your-project>.pages.dev` (add the custom domain too if you use one; comma-separated) |
| `APP_ENV` | `production` |
| `PRELOAD_MODELS` | `true` |
| `ALERT_DELIVERY` | `inline` (or `disabled`) |
| `RESEND_API_KEY`, `ALERT_RECIPIENT_EMAIL` | optional |
| `DB_POOL_SIZE` / `DB_MAX_OVERFLOW` | `3` / `2` |

Click **Create**. When it is green, open `https://<service>-<hash>.<region>.run.app/health`.

### Or from the command line

Create `cloudrun.env.yaml` (it is git-ignored, never commit it):

```yaml
DATABASE_URL: "postgresql+asyncpg://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?ssl=require"
JWT_SECRET: "<32+ random characters>"
CORS_ORIGINS: "https://<your-project>.pages.dev"
APP_ENV: "production"
PRELOAD_MODELS: "true"
ALERT_DELIVERY: "inline"
DB_POOL_SIZE: "3"
DB_MAX_OVERFLOW: "2"
```

```bash
gcloud run deploy finguardian-api \
  --image docker.io/<username>/finguardian-api:latest \
  --region asia-south1 \
  --allow-unauthenticated \
  --port 8080 --memory 2Gi --cpu 1 \
  --timeout 300 --concurrency 4 \
  --min-instances 0 --max-instances 1 \
  --env-vars-file cloudrun.env.yaml
```

New image version later: push the image, then
`gcloud run deploy finguardian-api --image docker.io/<username>/finguardian-api:latest --region asia-south1`
(or "Edit & deploy new revision" in the console).

## 4. Frontend on Cloudflare Pages

Cloudflare dashboard → Workers & Pages → Create → Pages → connect the GitHub repo:

| Setting | Value |
|---|---|
| Root directory | `frontend` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Environment variable | `VITE_API_BASE_URL` = your Cloud Run URL (no trailing slash) |

After the first deploy you know the `*.pages.dev` address: make sure it is in
Cloud Run's `CORS_ORIGINS`, then redeploy the Cloud Run revision.

## 5. Before a demo or the viva

1. Open the Supabase dashboard (wakes a paused free project).
2. Hit `<cloud-run-url>/health` once and wait for `"status": "ok"`: the first request
   after idle starts the container and loads FinBERT (expect 20–60 s).
3. Run one analysis yourself so everything is warm.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Revision fails, logs say "Memory limit exceeded" | Raise memory to `4Gi` (halves the free hours to ~25 h/month, still plenty) |
| Revision fails to start, logs show a DB error | `DATABASE_URL` wrong, or Supabase paused. Check it locally with the same value. |
| Browser shows a CORS error | The exact Pages origin (scheme + host, no trailing slash) must be in `CORS_ORIGINS` |
| `504` / request cancelled on first analysis | Cold start + slow Yahoo. Retry once; keep the timeout at 300 s |
| Unexpected bill | Check max instances is 1, billing is request-based, and min instances is 0 |
| `toomanyrequests` pulling from Docker Hub | Rare; redeploy a minute later, or log in to Docker Hub on the build side |
