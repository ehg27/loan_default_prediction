export function Card({ children, className = "", ...props }) {
  return (
    <div className={`card card-glow p-5 ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ eyebrow, title, subtitle, right }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-4">
      <div>
        {eyebrow && (
          <div className="text-[11px] tracking-[0.14em] uppercase font-medium mb-1" style={{ color: "var(--accent)" }}>
            {eyebrow}
          </div>
        )}
        {title && <h3 className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>{title}</h3>}
        {subtitle && <p className="text-[13px] mt-0.5" style={{ color: "var(--text-secondary)" }}>{subtitle}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}
