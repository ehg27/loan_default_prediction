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

## Deploying (frontend on Vercel, backend on Render)

The backend keeps trained models loaded in memory as a persistent process — it doesn't fit
Vercel's serverless Python functions well (size limits, cold starts re-importing xgboost/shap
on every idle request). Split hosting instead:

### 1. Backend → Render

`../render.yaml` (repo root) is a Render Blueprint that points at `webapp/backend`. From the
Render dashboard: **New → Blueprint**, connect this GitHub repo, and Render will read
`render.yaml` and provision the service automatically (free plan, `pip install -r
requirements.txt`, then `uvicorn main:app --host 0.0.0.0 --port $PORT`).

If you'd rather set it up by hand instead of via the Blueprint: **New → Web Service**, connect
the repo, set **Root Directory** to `webapp/backend`, **Build Command** to `pip install -r
requirements.txt`, **Start Command** to `uvicorn main:app --host 0.0.0.0 --port $PORT`.

Once deployed, note the service URL — something like `https://refracto-backend.onrender.com`.
Free-tier Render services spin down after 15 min idle and take ~30-50s to wake on the next
request; the first load after idle will be slow.

**Requires the 3 small live-inference models to be committed** (`../models/xgb_best.pkl`,
`xgb_isotonic.pkl`, `lr_best.pkl` — a few hundred KB total; the root `.gitignore` explicitly
un-ignores just these 3, everything else in `models/` stays out of git) plus
`backend/artifacts/*.json` and `backend/models/*.pkl` (both normally gitignored for local dev
since they're regenerable — force-add them for a deploy: `git add -f webapp/backend/artifacts
webapp/backend/models`). Regenerate and re-commit whenever `prepare_artifacts.py` changes.

### 2. Frontend → Vercel

From the Vercel dashboard: **New Project**, import this GitHub repo, set **Root Directory** to
`webapp/frontend` (Vercel auto-detects the Vite build otherwise). Add one environment variable:

```
VITE_API_BASE = https://<your-render-service>.onrender.com/api
```

(`src/lib/api.js` falls back to relative `/api` — which only works via Vite's local dev
proxy — so this env var is required for the deployed build to reach the backend at all.)
Deploy. No `vercel.json` needed — there's no client-side router (`App.jsx` is a single-page
`useState` switch), so there's nothing to add SPA rewrite rules for.

