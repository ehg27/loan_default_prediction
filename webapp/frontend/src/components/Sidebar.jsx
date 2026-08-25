// Small line icons, each drawn to actually depict what its page shows (not abstract glyphs).
const ICONS = {
  // A house — doubles as a callback to the prism's own silhouette.
  home: <path d="M2 7L7 2.3L12 7M3.4 5.8V12H10.6V5.8" />,
  // Overlapping circles — comparing multiple models against each other.
  models: <><circle cx="5.6" cy="7.4" r="3.6" /><circle cx="9.4" cy="7.4" r="3.6" /></>,
  // Ascending steps — literally the shape of a SHAP waterfall.
  explainability: <path d="M2 11.5H4.8V8.5H7.6V5.5H10.4V2.5H12.5" />,
  // A bowed curve against the diagonal — the reliability diagram itself.
  calibration: <><path d="M2 12L12 2" opacity="0.45" /><path d="M2 12C4.5 9.8 6.5 5.5 12 2" /></>,
  // A slider track with a handle — the threshold slider on that page.
  threshold: <><line x1="2" y1="7.4" x2="12" y2="7.4" /><circle cx="8.4" cy="7.4" r="1.7" fill="currentColor" stroke="none" /></>,
  // Three ascending bars — the by-vintage LGD chart on that page.
  lgd: <><rect x="2.3" y="7.2" width="2.2" height="4.6" rx="0.3" /><rect x="5.9" y="4.6" width="2.2" height="7.2" rx="0.3" /><rect x="9.5" y="2.4" width="2.2" height="9.4" rx="0.3" /></>,
};

const MAIN_ITEMS = [
  { id: "home", label: "Home" },
];

const TECHNICAL_ITEMS = [
  { id: "models", label: "Model Comparison" },
  { id: "explainability", label: "Explainability" },
  { id: "calibration", label: "Calibration" },
  { id: "lgd", label: "LGD Analysis" },
  { id: "threshold", label: "Threshold Optimizer" },
];

function NavButton({ item, active, onNavigate, muted }) {
  const isActive = active === item.id;
  return (
    <button
      onClick={() => onNavigate(item.id)}
      className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors text-left w-full"
      style={{
        background: isActive ? "var(--accent-soft)" : "transparent",
        color: isActive ? "var(--accent)" : muted ? "var(--text-tertiary)" : "var(--text-secondary)",
      }}
      onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "var(--bg-hover)"; }}
      onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" style={{ opacity: 0.85 }}>
        {ICONS[item.id]}
      </svg>
      <span className="truncate">{item.label}</span>
    </button>
  );
}

function Logo({ folded }) {
  return (
    <>
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)" }}
      >
        <svg width="28" height="28" viewBox="0 0 16 16" fill="none">
          <defs>
            <linearGradient id="facetLeft" x1="2" y1="13" x2="8" y2="2" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#5ac4e0" />
              <stop offset="55%" stopColor="#d9569b" />
              <stop offset="100%" stopColor="#e8935a" />
            </linearGradient>
            <linearGradient id="facetRight" x1="14" y1="13" x2="8" y2="2" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#5b9fe0" />
              <stop offset="45%" stopColor="#d9569b" />
              <stop offset="100%" stopColor="#e8935a" />
            </linearGradient>
            <linearGradient id="facetBottom" x1="2" y1="13" x2="14" y2="13" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#5ac4e0" />
              <stop offset="100%" stopColor="#e8d35a" />
            </linearGradient>
          </defs>
          {/* Faceted triangle, viewed face-on: three colored facets ringing a dark glass core —
              matches the reference icon, not the earlier "house" box-and-roof silhouette. */}
          <path d="M8 2L2 13L5.6 11.1L8 6.1Z" fill="url(#facetLeft)" />
          <path d="M8 2L14 13L10.4 11.1L8 6.1Z" fill="url(#facetRight)" />
          <path d="M2 13L14 13L10.4 11.1L5.6 11.1Z" fill="url(#facetBottom)" />
          <path d="M8 6.1L5.6 11.1L10.4 11.1Z" fill="#12213d" />
        </svg>
      </div>
      <div
        className="text-[15.5px] font-semibold whitespace-nowrap"
        style={{
          color: "var(--text)",
          opacity: folded ? 0 : 1,
          maxWidth: folded ? 0 : 175,
          overflow: "hidden",
          transition: "opacity 260ms ease, max-width 480ms cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        Refracto
      </div>
    </>
  );
}

export function Sidebar({ active, folded, onNavigate, onLogoClick }) {
  // A fixed overlay on every page (see App.jsx — main only ever reserves
  // space for the folded width), so opening it floats over page content
  // instead of pushing/resizing it — the same "floats over the hero video"
  // treatment the home page always had, now applied everywhere. Folded
  // (logo-only) gets a soft radial fade rather than a hard edge, so the rail
  // dissolves into whatever's behind it (video or plain page background)
  // instead of a visible cutoff; open gets a translucent, blurred scrim so
  // nav text stays legible over whatever it's floating above.
  const background = folded
    ? "radial-gradient(ellipse 160% 65% at 50% 0%, var(--bg) 45%, transparent 100%)"
    : "rgba(6,13,26,0.5)";

  return (
    <aside
      className="hidden lg:flex flex-col h-screen fixed top-0 left-0 py-6 pl-4 pr-4 overflow-hidden"
      style={{
        width: folded ? "76px" : "252px",
        borderRight: folded ? "1px solid transparent" : "1px solid rgba(255,255,255,0.08)",
        background,
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        transition: "width 480ms cubic-bezier(0.16,1,0.3,1), border-color 480ms ease, background 480ms ease",
        zIndex: 20,
      }}
    >
      {/* Fixed left position and padding regardless of folded state, so the
          logo never jumps when the panel opens/closes — only the wordmark
          beside it grows/shrinks. */}
      <button
        onClick={onLogoClick}
        className="flex items-center gap-2.5 mb-7 shrink-0"
        style={{ justifyContent: "flex-start", background: "none", border: "none", padding: "0 6px 0 0", cursor: "pointer" }}
        aria-label="Toggle navigation"
      >
        <Logo folded={folded} />
      </button>

      {/* Fixed-width content, independent of the aside's own animating width —
          the aside's overflow:hidden clips it, revealing it left-to-right as
          the rail opens instead of letting it reflow/rewrap mid-transition
          (which is what makes text visibly "jump" between line breaks). */}
      <div
        style={{
          width: 220,
          opacity: folded ? 0 : 1,
          transform: folded ? "translateX(-100px)" : "translateX(0)",
          transition: "opacity 250ms ease 40ms, transform 440ms cubic-bezier(0.16,1,0.3,1) 60ms",
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minHeight: 0,
        }}
      >
        <button
          onClick={() => onNavigate("simulator")}
          className="w-full mb-5 px-3.5 py-3 rounded-xl text-left transition-transform hover:scale-[1.015]"
          style={{
            backgroundImage: `
              repeating-linear-gradient(45deg, rgba(255,255,255,0.16) 0 1px, transparent 1px 46px),
              repeating-linear-gradient(-45deg, rgba(255,255,255,0.16) 0 1px, transparent 1px 46px),
              conic-gradient(from 45deg, rgba(255,255,255,0.16) 0deg 90deg, transparent 90deg 180deg, rgba(28,18,8,0.16) 180deg 270deg, transparent 270deg 360deg),
              linear-gradient(135deg, ${active === "simulator" ? "var(--accent), #c9863f" : "rgba(224,164,88,0.9), rgba(201,134,63,0.9)"})
            `,
            backgroundSize: "46px 46px, 46px 46px, 92px 92px, 100% 100%",
            boxShadow: "0 8px 24px -8px rgba(224,164,88,0.45)",
          }}
        >
          <div className="text-[10.5px] uppercase tracking-[0.1em] font-semibold" style={{ color: "rgba(36,24,4,0.65)" }}>
            Live demo
          </div>
          <div className="text-[14.5px] font-bold mt-0.5" style={{ color: "var(--accent-ink)" }}>
            ▶ Score an Application
          </div>
          <div className="text-[11px] mt-1" style={{ color: "rgba(36,24,4,0.65)" }}>
            Run the model on real or custom borrower data
          </div>
        </button>

        <nav className="flex flex-col gap-0.5">
          {MAIN_ITEMS.map((item) => (
            <NavButton key={item.id} item={item} active={active} onNavigate={onNavigate} />
          ))}
        </nav>

        <div className="px-3 mt-5 mb-1 text-[10.5px] uppercase tracking-[0.12em] font-semibold" style={{ color: "var(--text-tertiary)" }}>
          Technical deep-dive
        </div>
        <nav className="flex flex-col gap-0.5">
          {TECHNICAL_ITEMS.map((item) => (
            <NavButton key={item.id} item={item} active={active} onNavigate={onNavigate} muted />
          ))}
        </nav>

        <div className="mt-auto px-2 pt-5">
          <div
            className="rounded-xl p-3 text-[11.5px] leading-relaxed"
            style={{ background: "var(--bg-elevated-2)", border: "1px solid var(--border)", color: "var(--text-tertiary)" }}
          >
            Explainable AI framework for credit risk assessment - Trained on LendingClub's
            public loan dataset (2014–2020, 1.63M records, 20.0% default rate).
          </div>
        </div>
      </div>
    </aside>
  );
}
