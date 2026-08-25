"""
Precomputes artifacts/lgd_analysis.json for the "LGD Analysis" dashboard page — the same
methodology as LGD_Analysis.ipynb (project root), just emitted as JSON instead of notebook
output. Reads accepted_2007_to_2018Q4.csv directly (~1.7GB, not part of the main
preprocessed.csv pipeline), so this is a separate one-off script, not folded into
prepare_artifacts.py. Re-run only if that source CSV or the LGD methodology changes.

Run once from webapp/backend/:  python3 prepare_lgd_artifact.py
"""
import json
import time
from pathlib import Path

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SOURCE_CSV = PROJECT_ROOT / "accepted_2007_to_2018Q4.csv"
OUT_DIR = Path(__file__).resolve().parent / "artifacts"
OUT_DIR.mkdir(exist_ok=True)

ADOPTED_LGD = 0.63
PREVIOUS_LGD = 0.70
DEFAULTED_STATUSES = ["Charged Off", "Does not meet the credit policy. Status:Charged Off"]
MATURE_VINTAGE_YEARS = (2012, 2015)  # unaffected by the right-censoring bias — see below


def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def weighted_mean(values, weights):
    return float((values * weights).sum() / weights.sum())


def main():
    log(f"Loading {SOURCE_CSV.name} ...")
    cols = ["loan_status", "funded_amnt", "total_rec_prncp", "recoveries",
            "collection_recovery_fee", "issue_d"]
    df = pd.read_csv(SOURCE_CSV, usecols=cols, low_memory=False)
    total_rows = len(df)
    log(f"Total rows: {total_rows:,}")

    status_counts = df["loan_status"].value_counts(dropna=False)
    loan_status_counts = [
        {"status": (str(k) if pd.notna(k) else "(missing)"), "count": int(v)}
        for k, v in status_counts.items()
    ]

    d = df[df["loan_status"].isin(DEFAULTED_STATUSES)].copy()
    resolved_defaulted_count = len(d)
    log(f"Resolved charged-off loans: {resolved_defaulted_count:,}")

    d["net_recovery"] = d["recoveries"] - d["collection_recovery_fee"]
    d["net_loss"] = d["funded_amnt"] - d["total_rec_prncp"] - d["net_recovery"]
    d["lgd_raw"] = d["net_loss"] / d["funded_amnt"]
    share_below_0 = float((d["lgd_raw"] < 0).mean())
    share_above_1 = float((d["lgd_raw"] > 1).mean())
    d["lgd"] = d["lgd_raw"].clip(0, 1)

    all_vintages = {
        "n": resolved_defaulted_count,
        "unweighted_mean": float(d["lgd"].mean()),
        "weighted_mean": weighted_mean(d["lgd"], d["funded_amnt"]),
        "median": float(d["lgd"].median()),
    }

    d["issue_year"] = pd.to_datetime(d["issue_d"], format="%b-%Y").dt.year
    overlap = d[d["issue_year"] >= 2014]
    overlap_2014_2018 = {
        "n": int(len(overlap)),
        "unweighted_mean": float(overlap["lgd"].mean()),
        "weighted_mean": weighted_mean(overlap["lgd"], overlap["funded_amnt"]),
        "median": float(overlap["lgd"].median()),
    }

    by_vintage = []
    for year, g in d.groupby("issue_year"):
        by_vintage.append({
            "issue_year": int(year),
            "n": int(len(g)),
            "mean_lgd": float(g["lgd"].mean()),
            "weighted_lgd": weighted_mean(g["lgd"], g["funded_amnt"]),
        })
    by_vintage.sort(key=lambda r: r["issue_year"])

    mature = [r for r in by_vintage if MATURE_VINTAGE_YEARS[0] <= r["issue_year"] <= MATURE_VINTAGE_YEARS[1]]
    mature_weighted = [r["weighted_lgd"] for r in mature]
    mature_vintage_range = {
        "years": f"{MATURE_VINTAGE_YEARS[0]}-{MATURE_VINTAGE_YEARS[1]}",
        "weighted_lgd_low": min(mature_weighted),
        "weighted_lgd_high": max(mature_weighted),
    }

    out = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "source_file": SOURCE_CSV.name,
        "total_rows": total_rows,
        "loan_status_counts": loan_status_counts,
        "defaulted_statuses": DEFAULTED_STATUSES,
        "resolved_defaulted_count": resolved_defaulted_count,
        "formula": "LGD = (funded_amnt - total_rec_prncp - (recoveries - collection_recovery_fee)) / funded_amnt, clipped to [0, 1]",
        "clipping": {"share_below_0": share_below_0, "share_above_1": share_above_1},
        "summary": {
            "all_vintages": all_vintages,
            "overlap_2014_2018": overlap_2014_2018,
        },
        "by_vintage": by_vintage,
        "mature_vintage_range": mature_vintage_range,
        "adopted_lgd": ADOPTED_LGD,
        "previous_lgd": PREVIOUS_LGD,
    }

    (OUT_DIR / "lgd_analysis.json").write_text(json.dumps(out))
    log("Saved lgd_analysis.json")
    log(f"All-vintage weighted LGD: {all_vintages['weighted_mean']:.1%}, "
        f"2014-2018 weighted LGD: {overlap_2014_2018['weighted_mean']:.1%}, "
        f"mature-vintage range: {mature_vintage_range['weighted_lgd_low']:.1%}-{mature_vintage_range['weighted_lgd_high']:.1%}")


if __name__ == "__main__":
    main()
