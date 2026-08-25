// In local dev, relative "/api" hits Vite's proxy (see vite.config.js) which
// forwards to localhost:8000. In production (Vercel), there's no dev proxy,
// so VITE_API_BASE must be set to the deployed backend's URL, e.g.
// "https://refracto-backend.onrender.com/api" — see webapp/README.md "Deploying".
const BASE = import.meta.env.VITE_API_BASE || "/api";

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail?.detail || `POST ${path} failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  overview: () => get("/overview"),
  modelComparison: () => get("/models/comparison"),
  rocCurves: () => get("/models/roc"),
  prCurves: () => get("/models/pr"),
  calibration: () => get("/calibration"),
  explainability: () => get("/explainability"),
  thresholdAnalysis: () => get("/threshold-analysis"),
  lgdAnalysis: () => get("/lgd-analysis"),
  cases: () => get("/cases"),
  formMeta: () => get("/form-meta"),
  featureGlossary: () => get("/feature-glossary"),
  predict: (payload) => post("/predict", payload),
};
