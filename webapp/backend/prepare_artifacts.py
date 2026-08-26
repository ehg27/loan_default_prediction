"""
Regenerates the encoder/scaler (never saved from the notebook) using the exact same
train/test split, then precomputes every JSON artifact the dashboard needs so the
FastAPI server can serve most pages without touching sklearn/shap at request time.

Run once from webapp/backend/:  python prepare_artifacts.py
"""
import json
import time
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import (
    roc_auc_score, accuracy_score, f1_score, recall_score, precision_score,
    roc_curve, confusion_matrix, average_precision_score,
    precision_recall_curve, brier_score_loss,
)
from sklearn.calibration import calibration_curve
from sklearn.isotonic import IsotonicRegression
from sklearn.model_selection import train_test_split, cross_val_predict
from sklearn.preprocessing import OneHotEncoder, StandardScaler
import shap

PROJECT_ROOT = Path(__file__).resolve().parents[2]
MODELS_SRC = PROJECT_ROOT / "models"
DATA_PATH = PROJECT_ROOT / "preprocessed.csv"

OUT_DIR = Path(__file__).resolve().parent / "artifacts"
MODELS_OUT = Path(__file__).resolve().parent / "models"
OUT_DIR.mkdir(exist_ok=True)
MODELS_OUT.mkdir(exist_ok=True)

THRESHOLD = 0.4163  # user-chosen balance between the cost-minimizer (0.4838) and F1-optimal (0.2138)
LGD = 0.63  # empirical, from accepted_2007_to_2018Q4.csv: net loss / funded_amnt on 269k resolved
            # charged-off LendingClub loans (recoveries net of collection fees). See LGD_Analysis.ipynb.

NUMERIC_FEATURES = [
    'loan_amnt', 'term', 'dti_winsorized',
    'revol_util_winsorized', 'revol_bal_winsorized', 'open_acc_winsorized',
    'mort_acc_winsorized', 'log_annual_inc', 'has_pub_rec',
    'credit_age_months', 'sub_grade_num'
]
ONEHOT_COLS = ['home_ownership', 'verification_status', 'purpose', 'addr_state']

MODEL_FILES = {
    'Logistic Regression': 'lr_model.pkl',
    'Logistic Regression (Tuned)': 'lr_best.pkl',
    'Decision Tree': 'dt_model.pkl',
    'Decision Tree (Tuned)': 'dt_best.pkl',
    'Random Forest': 'rf_model.pkl',
    'Random Forest (Tuned)': 'rf_best.pkl',
    'XGBoost': 'xgb_model.pkl',
    'XGBoost (Tuned)': 'xgb_best.pkl',
}


def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def display_value_for(fname, orig):
    """Human-readable original-unit value for a SHAP hover tooltip (mirrors main.py's helper,
    but reads directly from the raw dataframe row `orig` since cases already carry every field)."""
    if fname == "loan_amnt":
        return f"${orig['loan_amnt']:,.0f}"
    if fname == "term":
        return f"{int(orig['term'])} months"
    if fname == "dti_winsorized":
        return f"{orig['dti_winsorized']:.1f}%"
    if fname == "revol_util_winsorized":
        return f"{orig['revol_util_winsorized'] * 100:.0f}%"
    if fname == "revol_bal_winsorized":
        return f"${orig['revol_bal_winsorized']:,.0f}"
    if fname == "open_acc_winsorized":
        return f"{orig['open_acc_winsorized']:.0f} accounts"
    if fname == "mort_acc_winsorized":
        return f"{orig['mort_acc_winsorized']:.0f} accounts"
    if fname == "log_annual_inc":
        return f"${orig['annual_inc']:,.0f}/yr"
    if fname == "has_pub_rec":
        return "Yes" if orig['has_pub_rec'] else "No"
    if fname == "credit_age_months":
        return f"{orig['credit_age_months'] / 12:.1f} years"
    if fname == "sub_grade_num":
        return str(orig['sub_grade'])
    for group_key in ["home_ownership", "verification_status", "purpose", "addr_state"]:
        if fname.startswith(group_key + "_") or fname == group_key:
            return str(orig[group_key])
    return "—"


def sanitize(arr):
    """Replace non-finite floats (inf/-inf/nan, e.g. sklearn's sentinel thresholds) with None
    so the payload is strict JSON (Starlette's JSONResponse rejects NaN/Infinity)."""
    return [None if (v is None or not np.isfinite(v)) else float(v) for v in arr]


def downsample_curve(x, y, extra=None, n=120):
    """Evenly downsample a curve (by index) to <= n points for compact JSON."""
    length = len(x)
    if length <= n:
        idx = np.arange(length)
    else:
        idx = np.unique(np.linspace(0, length - 1, n).astype(int))
    out = {"x": sanitize(np.asarray(x)[idx]), "y": sanitize(np.asarray(y)[idx])}
    if extra is not None:
        out["threshold"] = sanitize(np.asarray(extra)[idx])
    return out


def main():
    log("Loading preprocessed.csv ...")
    df = pd.read_csv(DATA_PATH, low_memory=False)

    X = df[NUMERIC_FEATURES + ONEHOT_COLS]
    y = df['loan_status']

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, stratify=y, random_state=42
    )

    log("Refitting encoder + scaler on X_train (same split/seed as training) ...")
    encoder = OneHotEncoder(drop='first', handle_unknown='ignore', sparse_output=False)
    train_ohe = encoder.fit_transform(X_train[ONEHOT_COLS])
    test_ohe = encoder.transform(X_test[ONEHOT_COLS])
    ohe_cols = encoder.get_feature_names_out(ONEHOT_COLS)

    scaler = StandardScaler()
    train_num = scaler.fit_transform(X_train[NUMERIC_FEATURES])
    test_num = scaler.transform(X_test[NUMERIC_FEATURES])

    feature_cols = NUMERIC_FEATURES + list(ohe_cols)
    X_train_enc = pd.DataFrame(np.hstack([train_num, train_ohe]), columns=feature_cols, index=X_train.index)
    X_test_enc = pd.DataFrame(np.hstack([test_num, test_ohe]), columns=feature_cols, index=X_test.index)

    joblib.dump(encoder, MODELS_OUT / "encoder.pkl")
    joblib.dump(scaler, MODELS_OUT / "scaler.pkl")
    (OUT_DIR / "feature_columns.json").write_text(json.dumps(feature_cols))
    log(f"Saved encoder/scaler. Feature vector length = {len(feature_cols)}")

    # ---- sanity check against a saved model (predictions should be non-trivial) ----
    xgb_best = joblib.load(MODELS_SRC / "xgb_best.pkl")
    sanity_auc = roc_auc_score(y_test, xgb_best.predict_proba(X_test_enc)[:, 1])
    log(f"Sanity check — XGBoost (Tuned) test ROC-AUC with regenerated split: {sanity_auc:.4f} "
        f"(notebook reported 0.7194)")

    # =========================================================
    # 1. MODEL COMPARISON + ROC / PR CURVES
    # =========================================================
    log("Scoring all 8 models ...")
    comparison = []
    roc_curves = {}
    pr_curves = {}
    model_objs = {}

    for name, fname in MODEL_FILES.items():
        model = joblib.load(MODELS_SRC / fname)
        model_objs[name] = model
        proba = model.predict_proba(X_test_enc)[:, 1]
        pred = model.predict(X_test_enc)

        cm = confusion_matrix(y_test, pred)
        tn, fp, fn, tp = cm.ravel()

        comparison.append({
            "model": name,
            "accuracy": accuracy_score(y_test, pred),
            "precision": precision_score(y_test, pred),
            "recall": recall_score(y_test, pred),
            "f1": f1_score(y_test, pred),
            "roc_auc": roc_auc_score(y_test, proba),
            "ap": average_precision_score(y_test, proba),
            "confusion_matrix": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)},
        })

        fpr, tpr, roc_th = roc_curve(y_test, proba)
        roc_curves[name] = downsample_curve(fpr, tpr, roc_th)

        prec, rec, pr_th = precision_recall_curve(y_test, proba)
        pr_th = np.append(pr_th, np.nan)
        pr_curves[name] = downsample_curve(rec, prec, pr_th)

    comparison.sort(key=lambda r: r["roc_auc"], reverse=True)
    (OUT_DIR / "model_comparison.json").write_text(json.dumps({
        "baseline_rate": float(y_test.mean()),
        "n_test": int(len(y_test)),
        "models": comparison,
    }, indent=2))
    (OUT_DIR / "roc_curves.json").write_text(json.dumps(roc_curves))
    (OUT_DIR / "pr_curves.json").write_text(json.dumps(pr_curves))
    log("Saved model_comparison.json, roc_curves.json, pr_curves.json")

    # =========================================================
    # 2. CALIBRATION (XGBoost Tuned, raw vs isotonic)
    # =========================================================
    log("Building calibration curves ...")
    isotonic = joblib.load(MODELS_SRC / "xgb_isotonic.pkl")
    xgb_test_proba = xgb_best.predict_proba(X_test_enc)[:, 1]
    xgb_test_calibrated = isotonic.predict(xgb_test_proba)

    raw_true, raw_pred = calibration_curve(y_test, xgb_test_proba, n_bins=10, strategy="quantile")
    iso_true, iso_pred = calibration_curve(y_test, xgb_test_calibrated, n_bins=10, strategy="quantile")

    calibration = {
        "raw": {"predicted": raw_pred.tolist(), "observed": raw_true.tolist()},
        "isotonic": {"predicted": iso_pred.tolist(), "observed": iso_true.tolist()},
        "brier_raw": brier_score_loss(y_test, xgb_test_proba),
        "brier_isotonic": brier_score_loss(y_test, xgb_test_calibrated),
        "mean_raw_pd": float(xgb_test_proba.mean()),
        "mean_calibrated_pd": float(xgb_test_calibrated.mean()),
        "actual_default_rate": float(y_test.mean()),
    }
    # =========================================================
    # 2b. LOGISTIC REGRESSION CALIBRATION
    # =========================================================
    # LR was trained with class_weight='balanced', which reweights the loss to counter class
    # imbalance — great for the decision boundary, but it means the raw sigmoid output is no
    # longer a true P(default|x) estimate (it runs far hotter than the actual base rate). Same
    # fix as XGBoost: isotonic regression on out-of-fold predictions maps it back to reality.
    log("Calibrating Logistic Regression (5-fold out-of-fold isotonic) ...")
    lr_best = model_objs['Logistic Regression (Tuned)']
    lr_oof_proba = cross_val_predict(lr_best, X_train_enc, y_train, cv=5, method="predict_proba", n_jobs=-1)[:, 1]
    lr_isotonic = IsotonicRegression(out_of_bounds="clip")
    lr_isotonic.fit(lr_oof_proba, y_train)
    joblib.dump(lr_isotonic, MODELS_OUT / "lr_isotonic.pkl")

    # Small background sample for shap.LinearExplainer at request time in main.py — a compact
    # reference distribution, not the full 1.3M-row training set.
    lr_background = X_train_enc.sample(200, random_state=42)
    joblib.dump(lr_background, MODELS_OUT / "lr_background.pkl")

    lr_test_proba = lr_best.predict_proba(X_test_enc)[:, 1]
    lr_test_calibrated = lr_isotonic.predict(lr_test_proba)

    lr_raw_true, lr_raw_pred = calibration_curve(y_test, lr_test_proba, n_bins=10, strategy="quantile")
    lr_iso_true, lr_iso_pred = calibration_curve(y_test, lr_test_calibrated, n_bins=10, strategy="quantile")

    calibration["lr_raw"] = {"predicted": lr_raw_pred.tolist(), "observed": lr_raw_true.tolist()}
    calibration["lr_isotonic"] = {"predicted": lr_iso_pred.tolist(), "observed": lr_iso_true.tolist()}
    calibration["lr_brier_raw"] = brier_score_loss(y_test, lr_test_proba)
    calibration["lr_brier_isotonic"] = brier_score_loss(y_test, lr_test_calibrated)
    calibration["lr_mean_raw_pd"] = float(lr_test_proba.mean())
    calibration["lr_mean_calibrated_pd"] = float(lr_test_calibrated.mean())
    (OUT_DIR / "calibration.json").write_text(json.dumps(calibration, indent=2))
    log(f"Saved calibration.json — LR Brier raw {calibration['lr_brier_raw']:.4f} -> "
        f"isotonic {calibration['lr_brier_isotonic']:.4f}")

    # =========================================================
    # 3. FEATURE IMPORTANCE (gain) + SHAP (sampled)
    # =========================================================
    log("Computing XGBoost gain importance ...")
    gain_importance = pd.Series(xgb_best.feature_importances_, index=feature_cols) \
        .sort_values(ascending=False)

    log("Computing SHAP values on a 4000-row sample of X_test (TreeExplainer) ...")
    rng = np.random.RandomState(42)
    sample_idx = rng.choice(X_test_enc.index, size=min(4000, len(X_test_enc)), replace=False)
    X_shap = X_test_enc.loc[sample_idx]
    explainer = shap.TreeExplainer(xgb_best)
    shap_values = explainer.shap_values(X_shap)
    base_value = float(np.asarray(explainer.expected_value).reshape(-1)[0])

    mean_abs_shap = pd.Series(np.abs(shap_values).mean(axis=0), index=feature_cols) \
        .sort_values(ascending=False)
    top_features = mean_abs_shap.head(20).index.tolist()

    # direction: sign of correlation between each feature's raw (scaled) value and its SHAP
    # contribution -> "higher value pushes toward default" vs "higher value reduces default risk"
    direction = {}
    for feat in feature_cols:
        col_idx = feature_cols.index(feat)
        corr = np.corrcoef(X_shap[feat].values, shap_values[:, col_idx])[0, 1]
        if np.isnan(corr):
            direction[feat] = "flat"
        else:
            direction[feat] = "higher_increases_risk" if corr > 0.05 else (
                "higher_decreases_risk" if corr < -0.05 else "flat"
            )

    beeswarm = {}
    for feat in top_features:
        col_idx = feature_cols.index(feat)
        raw_vals = X_shap[feat].values
        # normalize 0-1 for color mapping on the frontend
        vmin, vmax = np.percentile(raw_vals, [2, 98])
        denom = (vmax - vmin) if vmax > vmin else 1.0
        norm = np.clip((raw_vals - vmin) / denom, 0, 1)
        beeswarm[feat] = {
            "shap": shap_values[:, col_idx].tolist(),
            "feature_value_norm": norm.tolist(),
        }

    dependence = {}
    for feat in mean_abs_shap.head(6).index.tolist():
        col_idx = feature_cols.index(feat)
        dependence[feat] = {
            "feature_value": X_shap[feat].values.tolist(),
            "shap": shap_values[:, col_idx].tolist(),
        }

    explainability = {
        "base_value": base_value,
        "gain_importance": [{"feature": k, "value": float(v)} for k, v in gain_importance.items()],
        "mean_abs_shap": [
            {"feature": k, "value": float(v), "direction": direction.get(k, "flat")}
            for k, v in mean_abs_shap.items()
        ],
        "beeswarm": beeswarm,
        "dependence": dependence,
    }
    (OUT_DIR / "explainability.json").write_text(json.dumps(explainability))
    log("Saved explainability.json")

    # =========================================================
    # 4. FINANCIAL THRESHOLD OPTIMIZATION (on held-out test set)
    # =========================================================
    log("Running financial threshold optimization ...")
    financial_test = df.loc[X_test_enc.index]
    thresholds = np.linspace(xgb_test_calibrated.min(), xgb_test_calibrated.max(), 80)

    # Baselines: approve everyone (no model) vs. decline everyone. Approve-all cost is a
    # function of LGD (default loss scales with it), so it must be recomputed per LGD level —
    # comparing every LGD tab's costs against a single fixed-LGD baseline was a bug that made
    # "savings vs. no model" meaningless for every LGD except the one baseline was computed at.
    all_default_mask = (y_test.values == 1)
    all_nondefault_mask = (y_test.values == 0)

    def baseline_approve_all_cost_at(lgd):
        return float((financial_test.loc[all_default_mask, 'loan_amnt'] * lgd).sum())

    baseline_approve_all_cost = baseline_approve_all_cost_at(LGD)
    baseline_decline_all_cost = float((
        financial_test.loc[all_nondefault_mask, 'term'] * financial_test.loc[all_nondefault_mask, 'installment']
        - financial_test.loc[all_nondefault_mask, 'loan_amnt']
    ).sum())

    def metrics_at_threshold(th, lgd=LGD, pd_scores=None):
        scores = xgb_test_calibrated if pd_scores is None else pd_scores
        pred = (scores >= th).astype(int)
        fp_mask = (pred == 1) & (y_test.values == 0)
        fn_mask = (pred == 0) & (y_test.values == 1)
        fp_cost = float((
            financial_test.loc[fp_mask, 'term'] * financial_test.loc[fp_mask, 'installment']
            - financial_test.loc[fp_mask, 'loan_amnt']
        ).sum())
        fn_cost = float((financial_test.loc[fn_mask, 'loan_amnt'] * lgd).sum())
        return {
            "threshold": float(th),
            "fp_cost": fp_cost, "fn_cost": fn_cost, "total_cost": fp_cost + fn_cost,
            "fp_count": int(fp_mask.sum()), "fn_count": int(fn_mask.sum()),
            "accuracy": float(accuracy_score(y_test, pred)),
            "precision": float(precision_score(y_test, pred, zero_division=0)),
            "recall": float(recall_score(y_test, pred, zero_division=0)),
            "f1": float(f1_score(y_test, pred, zero_division=0)),
            "roc_auc": float(roc_auc_score(y_test, scores)),
            "ap": float(average_precision_score(y_test, scores)),
            "savings_vs_approve_all": baseline_approve_all_cost_at(lgd) - fp_cost - fn_cost,
        }

    # Single cost curve at the project's one reference LGD — this dashboard doesn't offer an LGD
    # picker (removed 2026-08-25; see CLAUDE.md), since sweeping LGD implied it was still an open
    # variable when it's actually a fixed, empirically-derived assumption (LGD_Analysis.ipynb).
    curve = [metrics_at_threshold(th) for th in thresholds]

    # Named key operating points (from the FYP's multi-objective threshold discussion), all at LGD=40%.
    # F1-optimal and financial-optimal are found fresh off the sampled curve each run rather than
    # hardcoded, since both shift slightly whenever LGD or the threshold grid changes.
    f1_optimal_row = max((metrics_at_threshold(th) for th in thresholds), key=lambda r: r["f1"])
    financial_optimal_row = min((metrics_at_threshold(th) for th in thresholds), key=lambda r: r["total_cost"])
    key_points = {
        "f1_optimal": {"label": "F1-optimal", **f1_optimal_row},
        "chosen": {"label": "Chosen (balanced)", "threshold": THRESHOLD, **metrics_at_threshold(THRESHOLD)},
        "financial_optimal": {"label": "Financially optimal", **financial_optimal_row},
    }
    key_points["baseline_approve_all"] = {
        "label": "No model (approve everyone)", "threshold": None,
        "fp_cost": 0.0, "fn_cost": baseline_approve_all_cost, "total_cost": baseline_approve_all_cost,
        "accuracy": float(1 - y_test.mean()), "precision": None, "recall": 0.0, "f1": 0.0,
        "savings_vs_approve_all": 0.0,
    }
    # Logistic Regression judged at the same shared threshold/LGD as XGBoost's "chosen" point
    # (no separate threshold search for LR, by design — see CLAUDE.md) — lets the UI show
    # directly whether LR's cost at that operating point beats XGBoost's.
    key_points["chosen_lr"] = {
        "label": "Chosen (Logistic Regression)", "threshold": THRESHOLD,
        **metrics_at_threshold(THRESHOLD, pd_scores=lr_test_calibrated),
    }

    (OUT_DIR / "threshold_analysis.json").write_text(json.dumps({
        "curve": curve,
        "key_points": key_points,
        "key_points_lgd": LGD,
        "baseline_approve_all_cost": baseline_approve_all_cost,
        "baseline_decline_all_cost": baseline_decline_all_cost,
    }))
    log("Saved threshold_analysis.json")
    log(f"Key points — F1-optimal: {key_points['f1_optimal']['total_cost']:,.0f}, "
        f"Chosen: {key_points['chosen']['total_cost']:,.0f}, "
        f"Financial-optimal: {key_points['financial_optimal']['total_cost']:,.0f}, "
        f"Baseline: {baseline_approve_all_cost:,.0f}")

    # Net portfolio value — idealized ceiling assuming perfect foresight (whole dataset, LGD=40%)
    non_default = df.loc[df['loan_status'] == 0]
    total_interest = (non_default['installment'] * non_default['term'] - non_default['loan_amnt']).sum()
    defaulted = df.loc[df['loan_status'] == 1]
    default_loss = (defaulted['loan_amnt'] * LGD).sum()
    overview_finance = {
        "total_interest": float(total_interest),
        "default_loss": float(default_loss),
        "net_value": float(total_interest - default_loss),
        "lgd_used": LGD,
        # Realistic figures achieved by the model at the chosen operating threshold, on the
        # held-out test set (not extrapolated to the full dataset).
        "realistic_test_set": {
            "fp_cost": key_points["chosen"]["fp_cost"],
            "fn_cost": key_points["chosen"]["fn_cost"],
            "total_cost": key_points["chosen"]["total_cost"],
            "savings_vs_no_model": key_points["chosen"]["savings_vs_approve_all"],
            "baseline_approve_all_cost": baseline_approve_all_cost,
            "n_test": int(len(y_test)),
            "lgd_used": LGD,
        },
    }

    # =========================================================
    # 5. CASE EXPLORER (TP / TN / FP / FN samples with SHAP)
    # =========================================================
    log("Building case explorer samples ...")
    raw_pd_full = xgb_best.predict_proba(X_test_enc)[:, 1]
    calibrated_pd_full = isotonic.predict(raw_pd_full)
    predicted_full = (calibrated_pd_full >= THRESHOLD).astype(int)
    actual_full = y_test.values

    outcome = np.select(
        [
            (actual_full == 1) & (predicted_full == 1),
            (actual_full == 0) & (predicted_full == 0),
            (actual_full == 0) & (predicted_full == 1),
            (actual_full == 1) & (predicted_full == 0),
        ],
        ["TP", "TN", "FP", "FN"],
        default="Unknown",
    )
    case_df = pd.DataFrame({
        "actual": actual_full, "raw_pd": raw_pd_full, "calibrated_pd": calibrated_pd_full,
        "predicted": predicted_full, "outcome": outcome,
    }, index=X_test_enc.index)

    LGD_DEFAULT = LGD
    cases_out = []
    per_outcome = 8
    for oc in ["TP", "TN", "FP", "FN"]:
        subset = case_df[case_df.outcome == oc].sort_values(
            "calibrated_pd", ascending=(oc in ["TN", "FN"])
        )
        picks = subset.iloc[np.linspace(0, len(subset) - 1, min(per_outcome, len(subset))).astype(int)]
        for idx, row in picks.iterrows():
            x_row = X_test_enc.loc[[idx]]
            sv = explainer.shap_values(x_row)[0]
            order = np.argsort(-np.abs(sv))
            orig = df.loc[idx]
            raw_logit = base_value + sv.sum()
            cases_out.append({
                "id": int(idx),
                "outcome": oc,
                "actual": int(row.actual),
                "raw_pd": float(row.raw_pd),
                "calibrated_pd": float(row.calibrated_pd),
                "predicted": int(row.predicted),
                "predicted_label": "Default" if row.predicted else "No Default",
                "actual_label": "Defaulted" if row.actual else "Fully Paid",
                "expected_loss": float(row.calibrated_pd * orig.loan_amnt * LGD_DEFAULT),
                "borrower": {
                    "loan_amnt": float(orig.loan_amnt),
                    "term": int(orig.term),
                    "grade": str(orig.grade) if 'grade' in orig else None,
                    "sub_grade": str(orig.sub_grade) if 'sub_grade' in orig else None,
                    "home_ownership": str(orig.home_ownership),
                    "annual_inc": float(orig.annual_inc) if 'annual_inc' in orig else None,
                    "verification_status": str(orig.verification_status),
                    "purpose": str(orig.purpose),
                    "addr_state": str(orig.addr_state),
                    "dti": float(orig.dti_winsorized),
                    "revol_util": float(orig.revol_util_winsorized),
                    "revol_bal": float(orig.revol_bal_winsorized),
                    "open_acc": float(orig.open_acc_winsorized),
                    "mort_acc": float(orig.mort_acc_winsorized),
                    "has_pub_rec": bool(orig.has_pub_rec),
                    "credit_age_years": round(float(orig.credit_age_months) / 12, 1),
                },
                "shap_all": [
                    {
                        "feature": feature_cols[i],
                        "value": float(x_row.iloc[0, i]),
                        "display_value": display_value_for(feature_cols[i], orig),
                        "shap": float(sv[i]),
                    }
                    for i in order
                ],
                "base_value": base_value,
                "raw_logit": float(raw_logit),
            })
    (OUT_DIR / "cases.json").write_text(json.dumps(cases_out))
    log(f"Saved cases.json ({len(cases_out)} cases)")

    # =========================================================
    # 6. FORM METADATA (dropdowns, winsorization bounds, feature ranges)
    # =========================================================
    log("Building form metadata ...")
    grades = ['A', 'B', 'C', 'D', 'E', 'F', 'G']
    sub_grades = [f"{g}{i}" for g in grades for i in range(1, 6)]
    sub_grade_mapping = {val: i + 1 for i, val in enumerate(sub_grades)}

    bounds = {}
    for raw_col, key in [
        ('dti', 'dti'), ('revol_util', 'revol_util'), ('revol_bal', 'revol_bal'),
        ('open_acc', 'open_acc'), ('mort_acc', 'mort_acc'),
    ]:
        bounds[key] = {
            "p01": float(df[raw_col].quantile(0.01)),
            "p99": float(df[raw_col].quantile(0.99)),
            "median": float(df[raw_col].median()),
        }

    form_meta = {
        "sub_grade_mapping": sub_grade_mapping,
        "categories": {
            "home_ownership": sorted(df.home_ownership.dropna().unique().tolist()),
            "verification_status": sorted(df.verification_status.dropna().unique().tolist()),
            "purpose": sorted(df.purpose.dropna().unique().tolist()),
            "addr_state": sorted(df.addr_state.dropna().unique().tolist()),
        },
        "bounds": bounds,
        "defaults": {
            "loan_amnt": float(df.loan_amnt.median()),
            "annual_inc": float(df.annual_inc.median()),
            "credit_age_years": float(df.credit_age_months.median() / 12),
        },
        "reference_date": "2020-12-01",
        "threshold_default": THRESHOLD,
    }
    (OUT_DIR / "form_meta.json").write_text(json.dumps(form_meta, indent=2))
    log("Saved form_meta.json")

    # =========================================================
    # 7. OVERVIEW / HERO STATS
    # =========================================================
    best = comparison[0]
    overview = {
        "n_rows": int(len(df)),
        "n_features_raw": int(len(NUMERIC_FEATURES) + len(ONEHOT_COLS)),
        "n_features_encoded": int(len(feature_cols)),
        "default_rate": float(df['loan_status'].mean()),
        "best_model": best["model"],
        "best_roc_auc": best["roc_auc"],
        "best_ap": best["ap"],
        "brier_isotonic": calibration["brier_isotonic"],
        "operating_threshold": THRESHOLD,
        "finance": overview_finance,
        "threshold_key_points": key_points,
    }
    (OUT_DIR / "overview.json").write_text(json.dumps(overview, indent=2))
    log("Saved overview.json")

    log("All artifacts generated successfully.")


if __name__ == "__main__":
    main()
