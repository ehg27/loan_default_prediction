"""
FastAPI backend for the Loan Default Prediction dashboard.

Most endpoints just serve precomputed JSON artifacts (see prepare_artifacts.py).
The /api/predict endpoint runs a live inference + SHAP explanation for a single
hypothetical borrower entered through the "Try It" form.
"""
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import shap
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent
ARTIFACTS_DIR = BASE_DIR / "artifacts"
MODELS_DIR = BASE_DIR / "models"
SRC_MODELS_DIR = BASE_DIR.parent.parent / "models"

app = FastAPI(title="Loan Default XAI Dashboard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Load artifacts + model objects once at startup
# ---------------------------------------------------------------------------
_cache = {}


def load_json(name):
    if name not in _cache:
        with open(ARTIFACTS_DIR / name, "r") as f:
            _cache[name] = json.load(f)
    return _cache[name]


encoder = joblib.load(MODELS_DIR / "encoder.pkl")
scaler = joblib.load(MODELS_DIR / "scaler.pkl")
xgb_best = joblib.load(SRC_MODELS_DIR / "xgb_best.pkl")
isotonic = joblib.load(SRC_MODELS_DIR / "xgb_isotonic.pkl")
lr_best = joblib.load(SRC_MODELS_DIR / "lr_best.pkl")
lr_isotonic = joblib.load(MODELS_DIR / "lr_isotonic.pkl")
lr_background = joblib.load(MODELS_DIR / "lr_background.pkl")
explainer = shap.TreeExplainer(xgb_best)
lr_explainer = shap.LinearExplainer(lr_best, lr_background)
feature_columns = json.loads((ARTIFACTS_DIR / "feature_columns.json").read_text())
form_meta = load_json("form_meta.json")

NUMERIC_FEATURES = [
    'loan_amnt', 'term', 'dti_winsorized',
    'revol_util_winsorized', 'revol_bal_winsorized', 'open_acc_winsorized',
    'mort_acc_winsorized', 'log_annual_inc', 'has_pub_rec',
    'credit_age_months', 'sub_grade_num'
]
ONEHOT_COLS = ['home_ownership', 'verification_status', 'purpose', 'addr_state']

FEATURE_LABELS = {
    'loan_amnt': 'Loan amount',
    'term': 'Loan term (months)',
    'dti_winsorized': 'Debt-to-income ratio',
    'revol_util_winsorized': 'Revolving utilization',
    'revol_bal_winsorized': 'Revolving balance',
    'open_acc_winsorized': 'Open credit lines',
    'mort_acc_winsorized': 'Mortgage accounts',
    'log_annual_inc': 'Log annual income',
    'has_pub_rec': 'Has derogatory public record',
    'credit_age_months': 'Credit age (months)',
    'sub_grade_num': 'Sub-grade (1=A1 ... 35=G5)',
}

LGD_DEFAULT = 0.63  # empirical, from accepted_2007_to_2018Q4.csv — see prepare_artifacts.py, LGD_Analysis.ipynb

# Plain-English glossary for every raw concept the model was trained on (sourced from the
# LendingClub data dictionary + our own feature-engineering notes in EDA_Preprocess.ipynb).
# Keyed by the *raw* concept; one-hot dummies (e.g. "home_ownership_RENT") share their group's entry.
FEATURE_GLOSSARY = {
    "loan_amnt": {
        "label": "Loan amount",
        "group": "Loan",
        "description": "The dollar amount of the loan applied for by the borrower.",
    },
    "term": {
        "label": "Loan term",
        "group": "Loan",
        "description": "Repayment length in months — either 36 or 60. Longer terms carry more repayment risk.",
    },
    "sub_grade_num": {
        "label": "Sub-grade",
        "group": "Loan",
        "description": "LendingClub's own risk grade, converted to a number from 1 (A1, safest) to 35 (G5, riskiest). "
                        "This is the bank's existing risk-pricing signal, built from underwriting factors not otherwise in this dataset.",
    },
    "dti_winsorized": {
        "label": "Debt-to-income ratio",
        "group": "Credit profile",
        "description": "Monthly debt payments (excluding mortgage) divided by monthly income. Outliers beyond the 1st/99th percentile are capped (winsorized).",
    },
    "revol_util_winsorized": {
        "label": "Revolving utilization",
        "group": "Credit profile",
        "description": "Share of available revolving credit (e.g. credit cards) currently in use. High utilization is a classic sign of financial strain.",
    },
    "revol_bal_winsorized": {
        "label": "Revolving balance",
        "group": "Credit profile",
        "description": "Total outstanding balance across the borrower's revolving credit accounts.",
    },
    "open_acc_winsorized": {
        "label": "Open credit lines",
        "group": "Credit profile",
        "description": "Number of currently open credit accounts on the borrower's credit file.",
    },
    "mort_acc_winsorized": {
        "label": "Mortgage accounts",
        "group": "Credit profile",
        "description": "Number of mortgage accounts the borrower holds — a rough proxy for homeownership stability.",
    },
    "has_pub_rec": {
        "label": "Derogatory public record",
        "group": "Credit profile",
        "description": "Flag for any derogatory public record (bankruptcy or collections) on file — a strong negative credit signal.",
    },
    "credit_age_months": {
        "label": "Credit age",
        "group": "Credit profile",
        "description": "Months since the borrower's earliest reported credit line was opened. Longer credit history generally signals lower risk.",
    },
    "log_annual_inc": {
        "label": "Annual income",
        "group": "Borrower",
        "description": "Self-reported annual income, log-transformed to reduce the influence of extreme outliers.",
    },
    "home_ownership": {
        "label": "Home ownership",
        "group": "Borrower",
        "description": "Whether the borrower rents, owns outright, or has a mortgage.",
    },
    "verification_status": {
        "label": "Income verification",
        "group": "Borrower",
        "description": "Whether LendingClub verified the borrower's reported income, or left it self-reported.",
    },
    "purpose": {
        "label": "Loan purpose",
        "group": "Loan",
        "description": "The borrower's stated reason for the loan (debt consolidation, credit card payoff, small business, etc).",
    },
    "addr_state": {
        "label": "State",
        "group": "Borrower",
        "description": "US state of residence — captures regional economic variation.",
    },
}

DIRECTION_TEXT = {
    "higher_increases_risk": "Higher values push predictions toward default.",
    "higher_decreases_risk": "Higher values push predictions toward repayment (lower default risk).",
    "flat": "This feature has a mixed or weak directional effect in the model.",
}


def display_value_for(fname, source):
    """Human-readable value of the *original* (unscaled) borrower field behind an encoded
    feature, for the SHAP hover tooltip. `source` is a dict/Series with raw fields:
    loan_amnt, term, dti_winsorized, revol_util_winsorized, revol_bal_winsorized,
    open_acc_winsorized, mort_acc_winsorized, annual_inc, has_pub_rec, credit_age_months,
    sub_grade, home_ownership, verification_status, purpose, addr_state."""
    def g(k):
        return source[k] if k in source else None

    if fname == "loan_amnt":
        return f"RM {g('loan_amnt'):,.0f}"
    if fname == "term":
        return f"{int(g('term'))} months"
    if fname == "dti_winsorized":
        return f"{g('dti_winsorized'):.1f}%"
    if fname == "revol_util_winsorized":
        return f"{g('revol_util_winsorized') * 100:.0f}%"
    if fname == "revol_bal_winsorized":
        return f"RM {g('revol_bal_winsorized'):,.0f}"
    if fname == "open_acc_winsorized":
        return f"{g('open_acc_winsorized'):.0f} accounts"
    if fname == "mort_acc_winsorized":
        return f"{g('mort_acc_winsorized'):.0f} accounts"
    if fname == "log_annual_inc":
        inc = g('annual_inc')
        return f"RM {inc:,.0f}/yr" if inc is not None else "—"
    if fname == "has_pub_rec":
        return "Yes" if g('has_pub_rec') else "No"
    if fname == "credit_age_months":
        months = g('credit_age_months')
        return f"{months / 12:.1f} years" if months is not None else "—"
    if fname == "sub_grade_num":
        return g('sub_grade')
    for group_key in ["home_ownership", "verification_status", "purpose", "addr_state"]:
        if fname.startswith(group_key + "_") or fname == group_key:
            return g(group_key)
    return "—"


def glossary_lookup(feature_col):
    """Resolve an encoded feature column (e.g. 'home_ownership_RENT') to its glossary group."""
    if feature_col in FEATURE_GLOSSARY:
        return feature_col, FEATURE_GLOSSARY[feature_col]
    for group_key in ["home_ownership", "verification_status", "purpose", "addr_state"]:
        if feature_col.startswith(group_key + "_"):
            return group_key, FEATURE_GLOSSARY[group_key]
    return feature_col, {"label": feature_col.replace("_", " ").title(), "group": "Other", "description": ""}


def clip(value, lo, hi):
    return max(lo, min(hi, value))


class BorrowerInput(BaseModel):
    loan_amnt: float = Field(..., gt=0)
    term: int = Field(..., description="36 or 60")
    sub_grade: str = Field(..., description="e.g. B3")
    home_ownership: str
    verification_status: str
    purpose: str
    addr_state: str
    annual_inc: float = Field(..., gt=0)
    dti: float = Field(..., ge=0)
    revol_util: float = Field(..., ge=0)
    revol_bal: float = Field(..., ge=0)
    open_acc: float = Field(..., ge=0)
    mort_acc: float = Field(0, ge=0)
    has_pub_rec: bool = False
    credit_age_years: float = Field(..., ge=0)
    threshold: float | None = None


def build_feature_row(payload: BorrowerInput) -> pd.DataFrame:
    b = form_meta["bounds"]
    sub_grade_map = form_meta["sub_grade_mapping"]

    if payload.sub_grade not in sub_grade_map:
        raise HTTPException(400, f"Unknown sub_grade '{payload.sub_grade}'")
    if payload.term not in (36, 60):
        raise HTTPException(400, "term must be 36 or 60")

    row = {
        'loan_amnt': payload.loan_amnt,
        'term': payload.term,
        'dti_winsorized': clip(payload.dti, b['dti']['p01'], b['dti']['p99']),
        'revol_util_winsorized': clip(payload.revol_util, b['revol_util']['p01'], b['revol_util']['p99']),
        'revol_bal_winsorized': clip(payload.revol_bal, b['revol_bal']['p01'], b['revol_bal']['p99']),
        'open_acc_winsorized': clip(payload.open_acc, b['open_acc']['p01'], b['open_acc']['p99']),
        'mort_acc_winsorized': clip(payload.mort_acc, b['mort_acc']['p01'], b['mort_acc']['p99']),
        'log_annual_inc': np.log1p(payload.annual_inc),
        'has_pub_rec': int(payload.has_pub_rec),
        'credit_age_months': payload.credit_age_years * 12,
        'sub_grade_num': sub_grade_map[payload.sub_grade],
        'home_ownership': payload.home_ownership,
        'verification_status': payload.verification_status,
        'purpose': payload.purpose,
        'addr_state': payload.addr_state,
        # display-only convenience fields (not part of the encoded feature vector)
        'annual_inc': payload.annual_inc,
        'sub_grade': payload.sub_grade,
    }
    df_row = pd.DataFrame([row])

    num = scaler.transform(df_row[NUMERIC_FEATURES])
    ohe = encoder.transform(df_row[ONEHOT_COLS])
    ohe_cols = encoder.get_feature_names_out(ONEHOT_COLS)

    encoded = pd.DataFrame(
        np.hstack([num, ohe]),
        columns=NUMERIC_FEATURES + list(ohe_cols),
    )
    # ensure exact column order used at training time
    encoded = encoded.reindex(columns=feature_columns, fill_value=0.0)
    return encoded, row


# ---------------------------------------------------------------------------
# Routes — precomputed artifacts
# ---------------------------------------------------------------------------
@app.get("/api/overview")
def get_overview():
    return load_json("overview.json")


@app.get("/api/models/comparison")
def get_model_comparison():
    return load_json("model_comparison.json")


@app.get("/api/models/roc")
def get_roc_curves():
    return load_json("roc_curves.json")


@app.get("/api/models/pr")
def get_pr_curves():
    return load_json("pr_curves.json")


@app.get("/api/calibration")
def get_calibration():
    return load_json("calibration.json")


@app.get("/api/explainability")
def get_explainability():
    return load_json("explainability.json")


@app.get("/api/threshold-analysis")
def get_threshold_analysis():
    return load_json("threshold_analysis.json")


@app.get("/api/lgd-analysis")
def get_lgd_analysis():
    return load_json("lgd_analysis.json")


@app.get("/api/cases")
def get_cases():
    return load_json("cases.json")


@app.get("/api/form-meta")
def get_form_meta():
    meta = dict(form_meta)
    meta["feature_labels"] = FEATURE_LABELS
    return meta


@app.get("/api/feature-glossary")
def get_feature_glossary():
    """Every encoded feature the model was trained on, with a plain-English description and
    the empirical direction of its effect (computed from the SHAP sample in prepare_artifacts.py)."""
    explain = load_json("explainability.json")
    direction_by_feature = {row["feature"]: row["direction"] for row in explain["mean_abs_shap"]}
    importance_by_feature = {row["feature"]: row["value"] for row in explain["mean_abs_shap"]}

    rows = []
    for fname in feature_columns:
        group_key, entry = glossary_lookup(fname)
        one_hot_value = fname[len(group_key) + 1:] if fname != group_key and fname.startswith(group_key + "_") else None
        direction = direction_by_feature.get(fname, "flat")
        rows.append({
            "feature": fname,
            "group": entry["group"],
            "group_label": entry["label"],
            "one_hot_value": one_hot_value,
            "label": FEATURE_LABELS.get(fname, f"{entry['label']}: {one_hot_value}" if one_hot_value else entry["label"]),
            "description": entry["description"],
            "direction": direction,
            "direction_text": DIRECTION_TEXT[direction],
            "mean_abs_shap": importance_by_feature.get(fname, 0.0),
        })
    rows.sort(key=lambda r: -r["mean_abs_shap"])
    return {"features": rows, "raw_concepts": FEATURE_GLOSSARY}


# ---------------------------------------------------------------------------
# Live prediction + SHAP explanation
# ---------------------------------------------------------------------------
@app.post("/api/predict")
def predict(payload: BorrowerInput):
    encoded, raw_row = build_feature_row(payload)

    raw_proba = float(xgb_best.predict_proba(encoded)[:, 1][0])
    calibrated_proba = float(isotonic.predict([raw_proba])[0])
    threshold = payload.threshold if payload.threshold is not None else form_meta["threshold_default"]
    predicted_default = calibrated_proba >= threshold

    # Logistic Regression comparison — LR was trained with class_weight='balanced', which
    # distorts its raw probability far above the true rate. It now gets its own isotonic
    # calibrator (lr_isotonic.pkl, fit on out-of-fold predictions, same approach as XGBoost's),
    # so both models' scores are true P(default|x) estimates and directly comparable. Both are
    # judged against the same shared threshold — no separate threshold search was run for LR.
    lr_raw_proba = float(lr_best.predict_proba(encoded)[:, 1][0])
    lr_calibrated_proba = float(lr_isotonic.predict([lr_raw_proba])[0])
    lr_predicted_default = lr_calibrated_proba >= threshold

    def build_contributions(sv):
        order = np.argsort(-np.abs(sv))
        out = []
        for i in order:
            fname = feature_columns[i]
            group_key, entry = glossary_lookup(fname)
            if fname in FEATURE_LABELS:
                label = FEATURE_LABELS[fname]
            else:
                one_hot_value = fname[len(group_key) + 1:].replace('_', ' ').title()
                label = f"{entry['label']}: {one_hot_value}"
            out.append({
                "feature": fname,
                "label": label,
                "group": entry["group"],
                "description": entry["description"],
                "value": float(encoded.iloc[0, i]),
                "display_value": display_value_for(fname, raw_row),
                "shap": float(sv[i]),
            })
        return out

    sv = explainer.shap_values(encoded)[0]
    base_value = float(np.asarray(explainer.expected_value).reshape(-1)[0])
    raw_logit = base_value + float(sv.sum())
    contributions = build_contributions(sv)

    # LR's own explanation — for a linear model this is exact, not approximated: each feature's
    # contribution is just its (scaled) value times its fitted coefficient, which is exactly
    # what shap.LinearExplainer computes. Rendered with the same ShapWaterfall UI as XGBoost's.
    lr_sv = np.asarray(lr_explainer.shap_values(encoded))[0]
    lr_base_value = float(np.asarray(lr_explainer.expected_value).reshape(-1)[0])
    lr_contributions = build_contributions(lr_sv)

    expected_loss = calibrated_proba * payload.loan_amnt * LGD_DEFAULT

    return {
        "raw_pd": raw_proba,
        "calibrated_pd": calibrated_proba,
        "threshold": threshold,
        "predicted_default": bool(predicted_default),
        "base_value": base_value,
        "shap_contributions": contributions,
        "input_echo": raw_row,
        "expected_loss": expected_loss,
        "lgd_used": LGD_DEFAULT,
        "exposure_at_default": payload.loan_amnt,
        "model_comparison": {
            "xgboost": {"pd": calibrated_proba, "predicted_default": bool(predicted_default), "calibrated": True},
            "logistic_regression": {"pd": lr_calibrated_proba, "predicted_default": bool(lr_predicted_default), "calibrated": True},
        },
        "lr_base_value": lr_base_value,
        "lr_shap_contributions": lr_contributions,
        "output_breakdown": {
            "base_value_logodds": base_value,
            "sum_shap_logodds": float(sv.sum()),
            "raw_logit": raw_logit,
            "raw_pd_from_logit": float(1 / (1 + np.exp(-raw_logit))),
            "raw_pd_from_model": raw_proba,
            "calibrated_pd": calibrated_proba,
        },
        "lr_output_breakdown": {
            "base_value_logodds": lr_base_value,
            "sum_shap_logodds": float(lr_sv.sum()),
            "raw_logit": lr_base_value + float(lr_sv.sum()),
            "calibrated_pd": lr_calibrated_proba,
        },
    }


@app.get("/api/health")
def health():
    return {"status": "ok"}
