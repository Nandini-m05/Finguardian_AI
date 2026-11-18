# FinGuardian AI — frontend

React 19 + Vite, plain JavaScript. No UI or chart library: the design system lives in
`src/styles.css` and the charts are hand-written SVG in `src/components/charts.jsx`.

## Run it

Needs **Node 20.19+ or 22 LTS**.

```bash
cd frontend
cp .env.example .env.local     # points at http://localhost:8000
npm install
npm run dev                    # http://localhost:5173
```

### Without the backend (mock API)

```bash
npm run mock                   # terminal 1: fake API on :8000 (generated data)
npm run dev                    # terminal 2
```

Mock accounts: `user@demo.dev / user12345`, `admin@demo.dev / admin1234`,
`analyst@demo.dev / analyst1234`. GME / AMC are always flagged for review.
The mock's prices and headlines are generated, not real.

### Production build

```bash
npm run build                  # -> dist/
npm run preview                # serve dist/ on :4173
```

Cloudflare Pages settings: root `frontend`, build `npm run build`, output `dist`,
env `VITE_API_BASE_URL=https://<your-cloud-run-service>.run.app`.
`public/_redirects` makes deep links like `/app/history` work.

## Structure

```
src/
  main.jsx, App.jsx        routes (tiny history router in lib/router.jsx)
  styles.css               design tokens + every component style
  lib/api.js               fetch wrapper; token in localStorage; 401 -> login
  lib/auth.jsx             session context (restores on refresh)
  lib/analysis.js          risk breakdown, compare deltas, "what changed"
  components/              AppShell, AnalysisView, charts, Pipeline, Art (isometric art, reel, pixel hover), ui
  pages/                   Landing, Auth, Dashboard, Analyze, AnalysisDetail, History, Compare, Review
mock/server.mjs            dependency-free mock of the FastAPI endpoints
```
