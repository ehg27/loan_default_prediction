# Credit XAI Dashboard

Interactive dashboard for the FYP: an XGBoost + SHAP hybrid explainable AI framework for
loan default prediction. Two parts:

- **`backend/`** — FastAPI server. Serves precomputed model/SHAP/threshold artifacts and
  runs live inference + SHAP explanations for the "Try It Yourself" form.
- **`frontend/`** — React + Vite dashboard (dark theme).

## First-time setup

The trained models in `../models/*.pkl` don't include the fitted encoder/scaler (they were
never saved from the notebook), so artifacts must be regenerated once:

```bash
cd webapp/backend
pip install -r requirements.txt
python3 prepare_artifacts.py   # ~1-2 min: rebuilds encoder/scaler + all precomputed JSON
```

This recreates the exact train/test split (`random_state=42`) used in `Modeling.ipynb`, so
results match the notebook (sanity-checked against the reported test ROC-AUC).

## Running

```bash
# Terminal 1 — backend (port 8000)
cd webapp/backend
python3 -m uvicorn main:app --port 8000

# Terminal 2 — frontend (port 5173, proxies /api to :8000)
cd webapp/frontend
npm install   # first time only
npm run dev
```

Open http://localhost:5173

## Re-running after changing the notebook / models

If you retrain models in `Modeling.ipynb` and overwrite `../models/*.pkl`, re-run
`prepare_artifacts.py` and restart the backend (it caches artifacts in memory on first
request, so a restart is required to pick up new files).

## Deploying (frontend on Vercel, backend on Fly.io)

The backend keeps trained models loaded in memory as a persistent process — it doesn't fit
Vercel's serverless Python functions well (size limits, cold starts re-importing xgboost/shap
on every idle request). Split hosting instead:

### 1. Backend → Fly.io

`../fly.toml` (repo root) + `backend/Dockerfile` define the deploy. The build context is the
**repo root**, not `webapp/backend` — `main.py` loads the 3 live-inference models from
`../../models` relative to itself (`SRC_MODELS_DIR`), a path that only exists outside
`webapp/backend`, so `fly.toml`/commands below all run from the repo root. One-time setup:

```bash
brew install flyctl        # or see https://fly.io/docs/hands-on/install-flyctl/
fly auth login
```

Then, with `prepare_artifacts.py` already run (see "First-time setup" above —
`webapp/backend/artifacts/*.json` and `webapp/backend/models/*.pkl` must exist on disk) and
`models/xgb_best.pkl`, `xgb_isotonic.pkl`, `lr_best.pkl` present at the repo root:

```bash
cd FYP_Project              # repo root — where fly.toml lives
fly launch --no-deploy      # first time only — detects fly.toml, creates the app on Fly
fly deploy
```

`fly deploy` builds using the **local directory** as the build context — unlike the old Render
setup, nothing needs to be force-added to git; whatever's on disk locally gets baked into the
image (`.dockerignore` at the repo root keeps the big unrelated files — raw CSVs, notebooks, the
frontend — out of the build). Regenerate (`prepare_artifacts.py`) and `fly deploy` again
whenever the models or artifact-generation logic change.

Once deployed, note the app URL — `https://<app-name>.fly.dev` (e.g.
`https://refracto-backend.fly.dev`; if `refracto-backend` is taken, pick another name via the
`fly launch` prompt or by changing `app` in `fly.toml` before creating it).

`fly.toml` ships with **scale-to-zero** (`min_machines_running = 0`): cheapest option, but the
first request after idle pays a cold-start delay (same tradeoff Render's free tier had). For an
always-on backend with no cold starts instead (bills continuously), change
`min_machines_running` to `1` in `fly.toml` and redeploy.

### 2. Frontend → Vercel

From the Vercel dashboard: **New Project**, import this GitHub repo, set **Root Directory** to
`webapp/frontend` (Vercel auto-detects the Vite build otherwise). Add one environment variable:

```
VITE_API_BASE = https://<your-app-name>.fly.dev/api
```

(`src/lib/api.js` falls back to relative `/api` — which only works via Vite's local dev
proxy — so this env var is required for the deployed build to reach the backend at all.)
Deploy. No `vercel.json` needed — there's no client-side router (`App.jsx` is a single-page
`useState` switch), so there's nothing to add SPA rewrite rules for.

