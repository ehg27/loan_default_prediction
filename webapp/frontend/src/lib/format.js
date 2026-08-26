export function fmtPct(x, digits = 1) {
  if (x === null || x === undefined || Number.isNaN(x)) return "—";
  return `${(x * 100).toFixed(digits)}%`;
}

export function fmtNum(x, digits = 0) {
  if (x === null || x === undefined || Number.isNaN(x)) return "—";
  return x.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function fmtUSD(x, compact = true) {
  if (x === null || x === undefined || Number.isNaN(x)) return "—";
  if (compact) {
    const abs = Math.abs(x);
    if (abs >= 1e9) return `$${(x / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `$${(x / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `$${(x / 1e3).toFixed(1)}K`;
  }
  return `$${fmtNum(x, 0)}`;
}

export const MODEL_COLORS = {
  "XGBoost (Tuned)": "#d9a15b",
  "XGBoost": "#e8c088",
  "Random Forest (Tuned)": "#7dd3a8",
  "Random Forest": "#4fae82",
  "Logistic Regression (Tuned)": "#7aa7e8",
  "Logistic Regression": "#4f7fc4",
  "Decision Tree (Tuned)": "#e88a9a",
  "Decision Tree": "#c45c70",
};

export function modelColor(name, fallback = "#9c9ca6") {
  return MODEL_COLORS[name] || fallback;
}

const FEATURE_LABELS = {
  loan_amnt: "Loan amount",
  term: "Loan term (months)",
  dti_winsorized: "Debt-to-income ratio",
  revol_util_winsorized: "Revolving utilization",
  revol_bal_winsorized: "Revolving balance",
  open_acc_winsorized: "Open credit lines",
  mort_acc_winsorized: "Mortgage accounts",
  log_annual_inc: "Log annual income",
  has_pub_rec: "Has derogatory public record",
  credit_age_months: "Credit age (months)",
  sub_grade_num: "Sub-grade (1=A1 ... 35=G5)",
};

export function humanFeature(name, labels) {
  if (labels && labels[name]) return labels[name];
  if (FEATURE_LABELS[name]) return FEATURE_LABELS[name];
  const prefixMatch = name.match(/^(home_ownership|verification_status|purpose|addr_state)_(.+)$/);
  if (prefixMatch) {
    const group = prefixMatch[1].replace(/_/g, " ");
    return `${group[0].toUpperCase()}${group.slice(1)}: ${prefixMatch[2].replace(/_/g, " ")}`;
  }
  return name
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
