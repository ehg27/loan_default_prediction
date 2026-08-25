# FYP: Explainable AI for Loan Default Prediction

Final Year Project (Loh Ehung, TP079311). Hybrid XAI framework: tuned **XGBoost** ensemble
+ **SHAP** post-hoc explanations for credit risk / loan default prediction, calibrated with
isotonic regression. Built to show financial institutions can have both accurate ensemble
models *and* human-readable explanations for every decision (the IR's core thesis — see
`/Users/ehung/Desktop/IR/FYP/TP079311 IR.pdf` for full academic writeup: abstract, problem
background, objectives, target users, SDG 8 alignment).

The dashboard is branded **"Refracto"** (Sidebar.jsx logo/name + index.html title, renamed from
"Refract" 2026-08-26) — the name refers to what SHAP does: refracting one opaque prediction into
its component feature contributions, like a prism splitting light into a spectrum. Deliberately
not "Prism" itself, which most technical readers associate with the NSA surveillance program.

Target users (per IR): credit evaluators/loan officers, bank risk managers/auditors,
financial regulatory bodies.

## Repo layout

```
FYP_Project/
├── loan_2014_20.csv          # raw LendingClub data (2014-2020), 585MB
├── preprocessed.csv           # cleaned+engineered dataset, 443MB, 1,632,364 rows
├── EDA_Preprocess.ipynb       # EDA + feature engineering (produces preprocessed.csv)
├── Modeling.ipynb             # trains all 8 models, calibration, threshold analysis, SHAP
├── LGD_Analysis.ipynb         # empirical LGD from accepted_2007_to_2018Q4.csv — see "Threshold selection"
├── accepted_2007_to_2018Q4.csv # fuller LendingClub extract w/ recovery fields, used only by LGD_Analysis.ipynb
│                                # and webapp/backend/prepare_lgd_artifact.py
├── LoanDataDictionary.xlsx    # official LendingClub column descriptions (sheet "LoanStats")
├── models/                    # trained .pkl models (see below) — committed outputs of Modeling.ipynb
└── webapp/                    # the dashboard (this is what most future work touches)
    ├── README.md               # setup/run instructions
    ├── backend/                # FastAPI
    │   ├── main.py              # API server — serves precomputed JSON + live /predict
    │   ├── prepare_artifacts.py # regenerates encoder/scaler + all precomputed JSON artifacts
    │   ├── prepare_lgd_artifact.py # separate: writes artifacts/lgd_analysis.json, see "LGD Analysis page"
    │   ├── requirements.txt
    │   ├── artifacts/           # precomputed JSON (gitignored, regenerate via prepare_artifacts.py)
    │   └── models/              # encoder.pkl, scaler.pkl (regenerated, NOT in ../../models)
    └── frontend/                # React 19 + Vite + Tailwind v4
        └── src/
            ├── App.jsx           # page router (simple useState, no react-router)
            ├── index.css         # theme tokens + global styles
            ├── components/       # Sidebar, ShapWaterfall, BeeswarmCanvas, ui/*
            ├── lib/               # api.js (fetch wrappers), format.js, useApi.js hook
            └── pages/             # Home, TryIt, Models, Explainability, Calibration,
                                    # ThresholdOptimizer, LGDAnalysis (no separate Overview page)
```

## Data pipeline (already done, in notebooks — don't redo unless asked)

- **Source**: LendingClub loans 2014–2020, `loan_2014_20.csv` → EDA/cleaning in
  `EDA_Preprocess.ipynb` → `preprocessed.csv` (1,632,364 rows, 20.0% default rate).
- **Feature engineering** (in `EDA_Preprocess.ipynb`, cell ~31):
  - `has_pub_rec` = `(pub_rec > 1) | (pub_rec_bankruptcies > 1)`
  - `sub_grade_num` = A1=1 … G5=35 (mapping: `grades = ['A'..'G']`, `f"{g}{i}"` for i in 1-5)
  - `credit_age_months` = months between `earliest_cr_line` and reference date **2020-12-01**
  - `log_annual_inc` = `log1p(annual_inc)`
  - Winsorization (1st/99th percentile clip) on: `dti`, `revol_util`, `revol_bal`, `open_acc`,
    `mort_acc`, `total_acc` → suffixed `_winsorized`
  - **Units gotcha**: `revol_util_winsorized` is a **fraction 0–1** (not 0–100). `dti_winsorized`
    IS already percentage-scale (e.g. 22.5 = 22.5%). Don't mix these up in the API/form.
- **Model features** (11 numeric + 4 one-hot categorical, 78 columns after encoding):
  ```
  NUMERIC_FEATURES = ['loan_amnt','term','dti_winsorized','revol_util_winsorized',
    'revol_bal_winsorized','open_acc_winsorized','mort_acc_winsorized','log_annual_inc',
    'has_pub_rec','credit_age_months','sub_grade_num']
  ONEHOT_COLS = ['home_ownership','verification_status','purpose','addr_state']
  ```
- **Split**: `train_test_split(X, y, test_size=0.2, stratify=y, random_state=42)` — this exact
  call (same seed) is how `prepare_artifacts.py` regenerates the encoder/scaler, so results
  match the notebook exactly (sanity-checked: regenerated split gives test ROC-AUC 0.7194,
  matching the notebook's reported value bit-for-bit).

## Models (`Modeling.ipynb`, outputs in `models/*.pkl`)

8 models trained: Logistic Regression, Decision Tree, Random Forest, XGBoost — each baseline
+ hyperparameter-tuned. **XGBoost (Tuned)** is best (ROC-AUC 0.7194, AP 0.3878) and is the
primary model the dashboard's live inference uses (`xgb_best.pkl`). **Logistic Regression
(Tuned)** (`lr_best.pkl`, ROC-AUC 0.7078) is also loaded live for a side-by-side comparison on
the Try It page — see "Logistic Regression live comparison" below.

- **Calibration**: isotonic regression (`xgb_isotonic.pkl`) fit on out-of-fold XGBoost
  predictions on the train set. Brier score improves 0.2145 → 0.1440. Always show the
  **calibrated** PD to users, never the raw XGBoost score (raw is just a ranking signal).
  **Logistic Regression gets its own separate isotonic calibrator** (`lr_isotonic.pkl`, fit the
  same way — 5-fold out-of-fold `predict_proba` on the train set, `prepare_artifacts.py`).
  This was added 2026-08-25 after the user noticed LR "didn't seem to predict the same thing as
  XGBoost": LR was trained with `class_weight='balanced'`, which reweights the loss for the
  decision boundary but badly distorts the raw probability (mean raw LR PD was 0.46 vs. the
  true 0.20 base rate; observed default rate in the top calibration bin was less than half what
  LR predicted). Isotonic fixed it — Brier 0.2177 → 0.1459, now close to XGBoost's 0.1440. LR's
  live prediction in `/predict` is now its own calibrated PD, judged against the **same shared
  threshold** as XGBoost (no separate threshold search was run for LR, by design).
  **LR explainability**: `shap.LinearExplainer(lr_best, lr_background)` — `lr_background.pkl`
  is a 200-row sample of `X_train_enc` saved by `prepare_artifacts.py`. For a linear model this
  decomposition is exact (coefficient × scaled feature value), not approximated like SHAP is
  for XGBoost. Exposed via a "Show Logistic Regression explanation" toggle on Try It, reusing
  `ShapWaterfall` with `lr_base_value` / `lr_shap_contributions` / `lr_output_breakdown`.
- **⚠️ encoder/scaler were never saved from the notebook** — `prepare_artifacts.py` regenerates
  them by re-running the identical train/test split + fit. This is why that script exists and
  must be re-run (and backend restarted) if `preprocessed.csv` or the split logic ever changes.
- **SHAP**: `shap.TreeExplainer(xgb_best)`, computed on the tuned XGBoost model.

## Threshold selection (important narrative, don't relitigate without reading this)

**Current reference point: LGD = 63%, threshold = 0.4163** (both set via the `LGD`/`THRESHOLD`
constants at the top of `prepare_artifacts.py`, kept in sync with `LGD_DEFAULT` in `main.py`).
LGD=63% is empirically derived — see "Empirical LGD" below. The threshold, 0.4163, is a
**deliberate user choice balancing cost against recall — not the pure cost-minimizer** (that's
a different point, 0.4838, "financial_optimal" below). Read "Chosen vs. cost-minimizer" before
touching `THRESHOLD` again.

Four named operating points, all on the held-out test set, LGD=63%:
| Threshold | Label | Recall | Precision | Total cost | vs. no model |
|---|---|---|---|---|---|
| 0.2138 | F1-optimal | 64.6% | 33.0% | RM769.61M | -RM109.22M (costs more) |
| **0.4163** | **Chosen (deliberate balance)** | **16.7%** | **50.2%** | **RM648.73M** | **+RM11.66M (saves)** |
| 0.4838 | Financially optimal (pure cost-minimizer) | 8.9% | 55.8% | RM644.99M | +RM15.40M (saves) |
| — | No model (approve all) | 0% | — | RM660.39M | — |

**Chosen vs. cost-minimizer (2026-08-25)**: from the 63% LGD change until this point, "Chosen"
and "Financially optimal" were the same point (0.4838) by construction — the code searched for
the cost-minimizer and copied it into `THRESHOLD`. The user then explicitly asked for a
threshold that trades a small amount of savings for meaningfully more recall, and picked
**0.4163**: give up RM3.74M of savings versus the pure cost-minimizer (RM11.66M saved instead of
RM15.40M) to catch **~1.9× as many defaults** (16.7% recall vs. 8.9%). `chosen` and
`financial_optimal` are now genuinely different points in `threshold_analysis.json`'s
`key_points` — don't assume they coincide, and don't quietly reset `THRESHOLD` back to match
`financial_optimal` if asked to touch this code again; the gap between them is intentional. The
frontend (`ThresholdOptimizer.jsx`) already handles both cases (a `chosenIsCostOptimal` boolean
picks the copy/narrative), so no component code needs to change if this value moves again —
just rerun `prepare_artifacts.py` and update the numbers below.

Separately, historical note on the cost-minimizer's own position: lowering LGD from 70% to 63%
(see below) made missed defaults (false negatives) cheaper relative to wrongly declining a good
applicant (false positives), which pushed the *cost-minimizing* threshold up (0.4388 → 0.4838)
and its recall down (14.7% → 8.9%) — approving more borderline applicants became the cheaper
strategy, since each one that does default now costs less than it used to. This is about
`financial_optimal` specifically, not the user-chosen `THRESHOLD` value.

**Empirical LGD (2026-08-25)**: the user supplied `accepted_2007_to_2018Q4.csv`, a fuller
LendingClub extract that (unlike `loan_2014_20.csv`) retains the recovery fields
(`total_rec_prncp`, `recoveries`, `collection_recovery_fee`). Full methodology and executed
numbers are in `LGD_Analysis.ipynb`: on 269,320 resolved `Charged Off` loans,
`LGD = (funded_amnt − total_rec_prncp − net_recovery) / funded_amnt` gives a funded-amount-weighted
mean of 65.3% (all vintages) / 66.5% (2014–2018Q4, this project's overlap window). A by-vintage
breakdown found the pooled figure is inflated by **right-censoring**: loans charged off near the
file's 2018Q4 snapshot haven't finished their post-charge-off collections process yet, so recent
vintages show LGD up to 90% while mature 2012–2015 vintages hold steady at 56–62%. **LGD=0.63**
was adopted as the midpoint of that credible range — still close to the old 70% industry-benchmark
guess, but now backed by actual defaulted-loan recoveries rather than a cited range for the loan
type.

**Why the old 70% wasn't wrong, just unverified**: LGD=40-45% is typical for *secured* lending
(mortgages, auto loans) where collateral recovery limits loss. These are LendingClub **unsecured
personal loans** — industry-typical LGD for unsecured consumer credit runs much higher (~65-85%,
no collateral to recover), and 70% was a defensible mid-range estimate for that loan type. The
empirical analysis confirms that instinct was in the right neighborhood, just a bit high.

**⚠️ Two real bugs were found and fixed while reframing this (2026-08-24/25) — read before
touching `prepare_artifacts.py`'s threshold/cost code again:**
1. `baseline_approve_all_cost` (the "approve everyone" cost used to compute `savings_vs_approve_all`)
   was computed **once**, at a single fixed LGD, then reused for every LGD level's savings
   calculation in `by_lgd` — the artifact then had a full 0.40–0.90 LGD sweep, with a UI picker on
   the Threshold Optimizer page to browse it. Since baseline cost scales with LGD, every LGD tab
   except the one matching that fixed value produced a meaningless, LGD-mismatched "savings"
   number. Fixed by computing baseline as a function of `lgd` (`baseline_approve_all_cost_at(lgd)`)
   and calling it fresh inside `metrics_at_threshold` for whichever `lgd` that call is scoring.
   (**The `by_lgd` sweep and LGD picker no longer exist** — removed 2026-08-25 once LGD became a
   single fixed, empirically-derived constant rather than an open variable worth letting users
   explore; the interactive chart is now `curve`, one array at the reference LGD only. This
   history is kept because `baseline_approve_all_cost_at(lgd)` itself is still in the code and the
   underlying lesson — recompute the baseline per-LGD, don't reuse a stale one — still applies.)
2. The old "~RM20.6M savings at threshold 0.4388, LGD=40%" figure the user had found by
   exploring the (buggy) UI was a direct symptom of bug #1 — correctly computed, that exact
   point actually **costs RM31.8M more** than doing nothing at LGD=40%. This is why LGD was
   moved to 70% (and, later, to the empirical 63%) instead: 0.4388/0.4838 are genuinely, not just
   apparently, the right answer at their respective LGDs. **If asked to change LGD or threshold
   again, always recompute `metrics_at_threshold` fresh and sanity-check `savings_vs_approve_all`
   against a manually derived baseline before trusting any UI number** — this class of bug is easy
   to reintroduce. (Done again for the 63% change: independently recomputed
   `baseline_approve_all_cost` straight from `preprocessed.csv`'s test split outside the script —
   matched the script's output to the cent, RM660,388,916.25.)

Full history for context: the *original* (pre-2026-08-24) setup used LGD=45%/threshold=0.3333,
chosen as a multi-objective balance that deliberately cost ~RM85M more than doing nothing in
exchange for much better default detection. Before that, an even earlier unresolved
"~RM114M savings" figure the user had separately calculated was flagged as irreconcilable and
never resolved — it's superseded by the above and no longer worth chasing.

## Running the webapp

```bash
# One-time / after retraining models or changing preprocessed.csv:
cd webapp/backend
pip install -r requirements.txt
python3 prepare_artifacts.py        # ~1-2 min, regenerates encoder/scaler + all JSON artifacts

# One-time / only if accepted_2007_to_2018Q4.csv or the LGD methodology changes (not needed for
# routine preprocessed.csv/model changes — see "LGD Analysis page" below):
python3 prepare_lgd_artifact.py     # ~15s, writes artifacts/lgd_analysis.json

# Every time:
cd webapp/backend && python3 -m uvicorn main:app --port 8000     # NOT run with --reload
cd webapp/frontend && npm install && npm run dev                  # port 5173, proxies /api → :8000
```

**Gotcha**: `main.py` caches loaded JSON artifacts in memory (`_cache` dict) and loads
`encoder.pkl`/`scaler.pkl`/models once at import time. After running `prepare_artifacts.py`
again, you **must kill and restart uvicorn** (`pkill -f "uvicorn main:app"`) — it won't pick up
new files otherwise, since it's not run with `--reload`.

## Backend API (`webapp/backend/main.py`)

All endpoints prefixed `/api`. Precomputed (served from `artifacts/*.json`, generated by
`prepare_artifacts.py`): `/overview`, `/models/comparison`, `/models/roc`, `/models/pr`,
`/calibration`, `/explainability`, `/threshold-analysis`, `/cases`, `/form-meta`. Also precomputed,
but generated by the separate `prepare_lgd_artifact.py` (not `prepare_artifacts.py` — see "LGD
Analysis page" below): `/lgd-analysis`.

Computed live: `/feature-glossary` (merges static `FEATURE_GLOSSARY` dict in `main.py` with
computed SHAP direction from `explainability.json`), `POST /predict` (live XGBoost inference +
isotonic calibration + SHAP explanation for a borrower payload — see `BorrowerInput` model).

`/predict` response includes: `raw_pd`, `calibrated_pd`, `predicted_default`,
`shap_contributions` (**all 78 features**, sorted by |SHAP|, each with `label`, `description`,
`display_value` [human-readable original-unit value, not the scaled/encoded one],
`shap`), `expected_loss` (= calibrated_pd × loan_amnt × LGD, `LGD_DEFAULT = 0.63` in `main.py`
— keep in sync with `prepare_artifacts.py`'s `LGD` constant), `output_breakdown` (base_value +
Σshap = raw_logit → raw_pd → calibrated_pd; backend still computes the intermediate
`raw_pd_from_logit`/`raw_pd_from_model` sigmoid step, but **the frontend no longer displays
it** — `ShapWaterfall.jsx`'s breakdown UI goes straight from "Raw output (log-odds)" to a single
"→ Output" line showing `calibrated_pd`, since showing two different probability-like numbers
back to back was confusing), and `model_comparison` (`{xgboost: {pd, predicted_default,
calibrated: true}, logistic_regression: {pd, predicted_default, calibrated: false}}` — the LR
live comparison shown on Try It; `lr_best.pkl` is loaded once at startup alongside XGBoost).

`display_value_for()` / `glossary_lookup()` helpers in `main.py` convert an encoded feature
name back to a human-readable value + description — duplicated (deliberately, not shared) in
`prepare_artifacts.py` for the `cases.json` generation since that script reads from the raw
dataframe row (`orig`) rather than the live request payload (`raw_row`).

## Frontend structure & key design decisions

- **No router** — `App.jsx` just does `useState("home")` + an object-keyed page lookup.
  Page ids: `home`, `simulator` (= TryIt.jsx), `models`, `explainability`, `calibration`,
  `threshold`, `lgd` (= LGDAnalysis.jsx). There is no separate `overview` page/id — the "At a
  glance" comparison lives in `Home.jsx`'s `GlanceCard` (see below); don't add an `overview` id
  expecting it to resolve to something.
- **Navigation** (`Sidebar.jsx`): pinned, gradient-styled CTA button above the regular nav
  (most prominent click target, per explicit user request) — labeled "Score an Application",
  not "Try it yourself" (changed for a more professional tone; the Home.jsx hero button matches).
  Logo mark is an inline SVG "house" pentagon (triangular roof over a box, matching a reference
  photo of an actual glass prism) with a single amber facet gradient and a tiny rainbow sliver
  at its base — not a text letter, and not the plain flat triangle used earlier. Home + Overview
  are top-level. Model Comparison / Explainability /
  Calibration / Threshold Optimizer sit under a **static** "Technical deep-dive" label —
  it used to be a collapsible dropdown but was changed to always-visible per user request
  (de-emphasized by styling/grouping alone, not by hiding).
- **TryIt.jsx** = merged "Try It Yourself" + "Case Explorer" (previously two separate pages,
  explicitly merged per user request). Layout: real test-set cases (browsable by outcome
  TP/TN/FP/FN) sit in a **full-width strip across the top** — deliberately not a narrow side
  column, since that felt cramped and buried the most useful entry point. Below that, a
  wider two-column form/results split. Clicking a case autofills the form AND auto-runs
  `/predict` (always live-inference, even for precomputed cases — single source of truth, lets
  the user tweak after loading). Results column includes a model decision card, an
  XGBoost-vs-Logistic-Regression comparison card (bar per model, flags disagreement), Expected
  Loss, and `ShapWaterfall` (top 20 + "show all 78" toggle + zoom modal, same `Modal`/`ZoomButton`
  pattern as Explainability's beeswarm/dependence zooms). The XGBoost-vs-LR benchmark card also
  has a "Show Logistic Regression explanation" toggle that reveals a second `ShapWaterfall` fed
  by `lr_base_value`/`lr_shap_contributions` — see "Logistic Regression live comparison" above.
  Clicking a case does **not** auto-scroll to the results (`loadCase` used to call
  `scrollIntoView`; removed per explicit user request — it moved the page on every click).
- **`ShapWaterfall.jsx`**: the per-row hover tooltip is rendered via `createPortal(..., document.body)`,
  not a plain `position: fixed` child. Reason: `.card`'s `backdrop-filter` (the glass effect)
  creates a new CSS containing block for `position: fixed` descendants — same as `filter` does
  per spec — so a naive fixed-positioned tooltip renders relative to the nearest Card ancestor,
  not the real viewport, and can end up positioned far off-screen despite viewport-clamped math
  looking correct in the component's own state. Portaling to `<body>` fixes this properly; don't
  revert to a plain `fixed` div without re-checking this.
- **`DependenceCanvas.jsx`**: SHAP dependence plots also moved off recharts `<Scatter>` onto raw
  `<canvas>` (same rationale as `BeeswarmCanvas.jsx` below) — non-interactive, no tooltip, 1.4px
  points. The recharts version was slow to load with a tooltip + several plots at once.
- **`Home.jsx`**'s `GlanceCard` (the "At a glance" section, despite the name suggesting
  `Overview.jsx` — it actually lives on the Home page) — leads with a single big "without a
  model / with this model / savings" comparison (large numbers) before anything else, so the
  financial takeaway is readable in one glance instead of requiring the reader to parse the full
  portfolio-simulation prose first. Went through two visual iterations of a below-the-numbers bar
  comparison (independent-length bars, then a shared-length red/green split bar) before being
  **removed entirely (2026-08-26)** — at the current numbers (~1.8% savings), any bar-based
  visual reads as "these two things are basically the same," which undersells a model that's
  still saving real money; the explicit RM figures and % callout above do that job without the
  visual implying the opposite. **Don't re-add a bar/proportional visual here** unless the
  savings percentage becomes large enough that a length comparison would actually look
  meaningful — check the current numbers first. The old "idealized ceiling" (perfect-foresight)
  figures are demoted to a smaller, clearly-labeled "Theoretical ceiling · not achievable" card
  further down, since conflating that hypothetical number with the realistic one was part of what
  made the page hard to parse at a glance.
- **Theme** (`index.css`): deep-navy backdrop (`--bg: #060d1a`, blue-toned radial-gradient wash)
  via `body { background: radial-gradient(...), ...; background-attachment: fixed; }` —
  **deliberately NOT a DOM/SVG element with `position:fixed`**. An earlier attempt using a
  fixed-position `<div>` background sibling (`BackgroundArt.jsx`, now deleted) caused a
  reproducible black-rectangle rendering bug on scroll in this environment's headless browser
  tool (confirmed via direct DOM inspection that the CSS/positions were correct — it was a
  compositor quirk with `position:fixed` + `backdrop-filter` siblings, not a real CSS bug, but
  the plain `background-attachment:fixed` approach sidesteps it entirely and is what's live
  now). If asked to add more background visual flourish, prefer extending the CSS gradients,
  not adding a new fixed DOM layer.
  - **Color system, two deliberately separate accent layers** (2026-08-25 redesign, per user
    request for a "glassy prism" feel — an earlier all-over rainbow attempt was explicitly
    rejected by the user as looking like decoration, not a signal):
    - `--facet-gradient` — single warm amber tone (dark → `--accent` → gold), used for the
      logo, primary CTAs, and `.facet-bg` (a CSS-only tessellated diamond texture: two diagonal
      `repeating-linear-gradient` hairline grids + a `conic-gradient` checkerboard, all one hue).
      This is the everyday UI accent — reused everywhere a button/highlight needs one.
    - `--beam-gradient` — the actual rainbow. Used in **exactly one place**: a large blurred
      light-beam graphic behind the Home hero headline (`Home.jsx`), standing in for a prism
      refracting light, echoing "Refracto." Do not reuse this on buttons, cards, or charts — that
      was tried and explicitly rejected. If asked for "more prism," extend the amber facet
      system or the one hero beam, not a general rainbow palette.
  - **Cost figures are red** (`var(--risk-high)`), not amber/neutral — both "without a model"
    and "with this model" on Overview's `GlanceCard` are costs (money lost to defaults/foregone
    interest), so they're colored as losses; only the savings delta is green.
- **`BeeswarmCanvas.jsx`**: renders SHAP beeswarm plots via raw `<canvas>` drawing (not
  recharts `<Scatter>`/`<Cell>` per-point React elements) — the recharts version was
  "insanely laggy" at ~4000 points × 15 features. Canvas draws all points in one `useEffect`
  pass; non-interactive (no per-point tooltip) by design per user request, but row labels are
  real DOM text (for crisp rendering + native `title` tooltips) overlaid via absolute
  positioning. Has a zoom modal (`components/ui/Modal.jsx`) for a bigger view.
- **Feature glossary**: `FEATURE_GLOSSARY` dict in `main.py`, descriptions sourced from
  `LoanDataDictionary.xlsx`. Direction of effect ("higher increases/decreases risk") computed
  empirically in `prepare_artifacts.py` via `corrcoef(feature_value, shap_value)` on the SHAP
  sample, not hardcoded.
- **Number/eyebrow-tag font (2026-08-25, tried Fraunces, reverted same day)**: the `.font-mono`
  class (used app-wide for every large stat number, SHAP value, and small uppercase eyebrow tag
  like "01 — Predictive gap") used to map to JetBrains Mono via the `--mono` CSS variable in
  `index.css` — a coding font, which read as slightly technical/utilitarian. Tried swapping to
  Fraunces (a display serif) for a more "sophisticated" numeral treatment — the user found it too
  unusual/not normal-looking, so it's back to just reusing the body sans
  (`--mono: var(--sans)` → Plus Jakarta Sans), giving numbers a plain look consistent with the
  rest of the page rather than their own typographic voice. **Don't reintroduce a distinct
  display/serif font for numbers without checking first** — this was explicitly rejected once
  already. `index.html`'s Google Fonts `<link>` only loads Plus Jakarta Sans again (Fraunces
  import removed). The variable is still named `--mono`/`.font-mono` (not renamed, even though it
  no longer points at a monospace font) so every existing `.font-mono` usage across 6+ files keeps
  working without touching each one. `.font-mono` still sets `font-variant-numeric: tabular-nums`
  for column alignment (e.g. `ShapWaterfall.jsx`'s stacked SHAP value list) — that part is
  font-independent and worth keeping regardless of which family `--mono` points to.
- **Home hero paragraph legibility (2026-08-25)**: the sub-headline paragraph over the scroll-
  scrubbed hero video (`Home.jsx`) used `--text-secondary` (a muted gray) with no shadow, which
  became unreadable wherever the video's bright light-beam frames scrubbed behind it — a plain
  color swap can't fix this on its own since the video content behind the text keeps changing as
  the user scrolls. Fixed with `color: var(--text)` (matches the H1) **plus** a dark
  `textShadow` (`0 2px 20px rgba(6,13,26,0.9), 0 1px 4px rgba(6,13,26,0.95)`) that gives every
  glyph a soft dark halo regardless of what's playing behind it — the standard technique for text
  over video/photos, not something a color change alone can solve. The inline `XGBoost`/`SHAP`
  emphasis spans were bumped from `var(--text)` to `var(--accent)` in the same edit, since the
  paragraph's base color is no longer `--text-secondary` and the old emphasis color would no
  longer stand out from the (now-brighter) surrounding text.
- **LGD Analysis page** (`pages/LGDAnalysis.jsx`, nav id `lgd`, 2026-08-25) — a page version of
  `LGD_Analysis.ipynb`'s methodology: loan-status breakdown table, the per-loan LGD formula, a
  by-vintage bar chart (recharts `BarChart` + `Cell` for per-bar coloring + `ReferenceArea` to
  shade the "mature," uncensored 2012–2015 window + `ReferenceLine` at the adopted 63%), and a
  closing comparison of all-vintage/mature-vintage/adopted LGD. Backed by its own precomputed
  artifact — `webapp/backend/prepare_lgd_artifact.py` reads `accepted_2007_to_2018Q4.csv` (~1.7GB,
  not part of the main `preprocessed.csv` pipeline) and writes `artifacts/lgd_analysis.json`,
  served by `GET /api/lgd-analysis` in `main.py`. Deliberately **not** folded into
  `prepare_artifacts.py`'s run (which reads `preprocessed.csv` and is re-run far more often) —
  keeping them separate means the 1.7GB source file is only ever read when the LGD methodology
  itself changes, not on every routine artifact regen. Nav order (`Sidebar.jsx`'s
  `TECHNICAL_ITEMS`): **LGD Analysis before Threshold Optimizer** — the assumption is established
  before the page that consumes it, not after.
  **⚠️ Tone (2026-08-25, explicit user request — "don't make me look bad")**: the page and
  `LGD_Analysis.ipynb`'s intro originally framed this as "our own dataset lacked recovery fields,
  so we patched it with another one" — reads like an admitted gap in an academic deliverable
  examiners will read. Rewritten to frame it as deliberate methodology: LGD is normally just an
  industry-benchmark citation because most projects' data can't support measuring it directly; this
  project instead validates the assumption empirically against real recoveries. Same facts, not
  self-deprecating framing. **Keep this framing** if either file is touched again — don't
  reintroduce "we didn't have X, so..." language about this project's own data limitations.
  **⚠️ Plain language (2026-08-25, second pass)**: the page was still too jargon-heavy — terms
  like "vintage," "right-censoring bias," "credible range," and "resolved defaults" were used
  without explanation, and the user said outright "dont use complex buzzwords, if needed then
  explain what they mean." Rewritten in plain English throughout (e.g. "vintage" → "the year a
  loan was issued," explained the first time it's used; "right-censoring" replaced with a plain
  explanation that recent loans' collections aren't finished yet, so their measured loss looks
  artificially high). **Also removed the 70% industry-benchmark figure from this page entirely**
  per explicit request — it no longer appears anywhere in `LGDAnalysis.jsx` (still fine to
  reference in `CLAUDE.md`/the notebook, which examiners don't read as the dashboard itself).
  The by-vintage chart's tooltip was also switched from `var(--bg-elevated-2)` (70%-opacity —
  the colorful bars showed through it, washing out the white text) to `var(--bg-elevated-solid)`
  (fully opaque) with explicit `labelStyle`/`itemStyle` colors — matches the pattern
  `ThresholdOptimizer.jsx` already used successfully; recharts' Tooltip content doesn't reliably
  inherit page text color, so relying on inheritance for tooltip readability isn't safe elsewhere
  in this codebase either if the same complaint comes up on another chart.
  **⚠️ `<Bar>` needs `isAnimationActive={false}` (found 2026-08-25, this same rewrite)**: while
  fixing the above, the by-vintage bars weren't rendering *at all* — 12 correctly-sized
  `recharts-bar-rectangle` groups existed in the DOM, every one completely empty (no `<path>`
  inside), confirmed by direct inspection, not a screenshot artifact. This is recharts 3.10.1's
  `<Bar>` default `isAnimationActive: 'auto'` getting stuck before ever painting a shape — this is
  the **only `<Bar>` in the whole codebase**, so this project had never hit it before. Every
  `<Line>` on every other chart page already explicitly sets `isAnimationActive={false}` (an
  established convention in this codebase); this one just didn't carry it over. Confirmed by
  bisection: removing the `<Cell>` children didn't fix it, adding an explicit `id` to `<Bar>`
  didn't fix it, only `isAnimationActive={false}` did — verified via DOM (`<path fill="..." .../>`
  present, 12/12 bars) before restoring the `<Cell>`-based mature/non-mature coloring. **If a
  future chart adds a `<Bar>`, `<Area>`, or any other recharts series, set
  `isAnimationActive={false}` on it immediately** rather than debugging this from scratch again.
- **Threshold Optimizer chart fixes (2026-08-25)**: the interactive cost-vs-threshold chart's
  `<input type="range">` slider used to be a plain full-card-width element below the chart, while
  the chart's actual plot area is inset by the Y-axis label width — so the slider visibly
  overshot the chart's real x-axis on both sides. Fixed by padding the slider's wrapper
  (`paddingLeft: 70, paddingRight: 55`) to match the chart's left cost-axis width and right
  margin/F1-axis width — verified pixel-exact via DOM inspection (both span 214–831px in a test
  render). Also added F1 score as a second line on its own right-side axis (`yAxisId="f1"`,
  domain `[0,1]`, dashed) — the chart used to show only the three cost curves, so "why isn't the
  threshold further left, where F1 is higher" wasn't answerable from the chart itself; now the
  cost-minimizing point and the F1 peak are both visible together, showing the real trade-off
  (lower threshold = higher F1 but far higher total cost) rather than requiring that to be taken
  on faith from the table above. A `<Legend/>` was added since there are now 4 lines.
  **Second pass (2026-08-25)**: the user reported the vertical "current position" line wasn't
  showing at all. First guess was a z-order overlap (it defaulted to `optimalIdx`, which at the
  time sat at the same x as the green "cost-optimal" marker) — reordered it to paint last and
  changed the default to `chosenIdx`, which are both reasonable improvements, but **didn't
  actually fix the bug**. The real cause, found by inspecting the rendered SVG directly: this repo
  runs **recharts 3.10.1**, and none of the three `<ReferenceLine>` elements had a `yAxisId` prop.
  Once the chart gained a second named `YAxis` (the F1 line, `yAxisId="f1"`, added earlier the
  same day), `ReferenceLine`'s undocumented-in-practice default (`yAxisId: 0`, a *number*) no
  longer matched either named axis ("cost" or "f1") — in recharts 3.x this makes the component
  silently resolve to nothing and render zero DOM nodes, not just render invisibly. Confirmed via
  DOM inspection: the reference lines' `<g>` layers were completely empty before the fix, and
  populated with real `<line>`/`<text>` nodes after adding `yAxisId="cost"` to all three. **Lesson
  for next time**: on this recharts version, adding a second `YAxis` to an existing chart silently
  breaks every `ReferenceLine`/`ReferenceArea`/`ReferenceDot` that doesn't explicitly repeat a
  matching `yAxisId` — grep for those components whenever a second axis is added, and verify via
  DOM inspection (not just "does the page look okay"), since the failure mode is invisible rather
  than a thrown error. A second "↺ Jump to chosen threshold" button was also added alongside the
  existing cost-optimal one, since `chosen` and `financial_optimal` are now two distinct,
  both-interesting points to jump between (see "Chosen vs. cost-minimizer" above). **2026-08-26**:
  that button originally only rendered once the user had dragged away from the default (`idx !==
  null`) — changed to always-visible, matching the cost-optimal button's behavior, since a control
  that disappears depending on state is more confusing than one that's just occasionally
  redundant. Also added a small custom legend row under the chart (colored dashes + labels:
  "Cost-optimal" / "Chosen" / "Current position") — recharts' `<Legend/>` only picks up data
  series (the `<Line>`s), not `<ReferenceLine>` markers, so the three vertical lines had no
  legend entry at all before this; the small inline chart labels alone weren't enough. And
  `KEY_POINT_ORDER` in the comparison table was reordered to No model → Financially optimal →
  F1-optimal → Chosen (was No model → F1-optimal → Chosen → Financially optimal) — purely a
  user preference for reading order, no data change.

- **Mobile/narrow-viewport nav**: `Sidebar` is `hidden lg:flex` with no hamburger fallback
  below 1024px. Fine for laptop/projector demo use; flagged but not built (would need for a
  tablet viva).
- **LGD/threshold history** — see "Threshold selection" above for the full story: LGD=45%→70%→63%,
  threshold=0.3333→0.4388→0.4838→**0.4163 (current, a deliberate user choice, not the
  cost-minimizer)**, and the two baseline-mismatch bugs that were found and fixed along the way.
  Older figures (the RM114M savings claim, the RM20.6M-at-LGD-40% figure) are resolved/superseded,
  not still-open — no need to re-litigate unless LGD/threshold changes again.
- **Empirical LGD, resolved 2026-08-25** (previously flagged as impossible with this project's
  data — see git history if curious about that earlier dead end). The user separately supplied
  `accepted_2007_to_2018Q4.csv`, a fuller LendingClub extract that, unlike this project's own
  `loan_2014_20.csv` (subset to 28 columns before this repo existed), retains the recovery fields
  (`total_rec_prncp`, `recoveries`, `collection_recovery_fee`). `LGD_Analysis.ipynb` computes a
  real, data-driven LGD from 269k resolved charged-off loans — see "Empirical LGD" under
  "Threshold selection" above for the number and methodology. `accepted_2007_to_2018Q4.csv` is
  large (~1.7GB) and used only for this one-off notebook; it is not part of the main pipeline and
  is not re-read anywhere else.
- Browser-tool scroll rendering: this dev environment's headless browser pane sometimes shows
  a stale/black frame after synthetic scroll actions on long pages — verified via direct JS
  DOM inspection (`getBoundingClientRect`, `getComputedStyle`) that this is a tool rendering
  artifact, not a real app bug, every time it came up. If it recurs, check the actual DOM/CSS
  state via `javascript_tool` before assuming a regression.
- `webapp/.gitignore` excludes `frontend/node_modules/`, `frontend/dist/`,
  `backend/artifacts/*.json`, `backend/models/*.pkl` — these are all regeneratable, not meant
  to be committed. The top-level repo's own `.gitignore` was already deleted before this
  project started (pre-existing state, unrelated to the webapp).
