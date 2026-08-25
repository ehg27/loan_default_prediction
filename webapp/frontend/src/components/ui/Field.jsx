export function Field({ label, hint, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>
        {label} {hint && <span style={{ color: "var(--text-tertiary)" }}>({hint})</span>}
      </span>
      {children}
    </label>
  );
}

const inputStyle = {
  background: "var(--bg-elevated-2)",
  border: "1px solid var(--border)",
  color: "var(--text)",
};

export function Input(props) {
  return (
    <input
      {...props}
      className={`px-3 py-2 rounded-lg text-[13px] outline-none focus:border-[var(--accent)] transition-colors ${props.className || ""}`}
      style={inputStyle}
    />
  );
}

export function Select({ children, ...props }) {
  return (
    <select
      {...props}
      className={`px-3 py-2 rounded-lg text-[13px] outline-none focus:border-[var(--accent)] transition-colors ${props.className || ""}`}
      style={inputStyle}
    >
      {children}
    </select>
  );
}
