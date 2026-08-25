import { useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { Home } from "./pages/Home";
import { Models } from "./pages/Models";
import { Explainability } from "./pages/Explainability";
import { Calibration } from "./pages/Calibration";
import { ThresholdOptimizer } from "./pages/ThresholdOptimizer";
import { TryIt } from "./pages/TryIt";
import { LGDAnalysis } from "./pages/LGDAnalysis";

const PAGES = {
  home: Home,
  simulator: TryIt,
  models: Models,
  explainability: Explainability,
  calibration: Calibration,
  threshold: ThresholdOptimizer,
  lgd: LGDAnalysis,
};

function App() {
  const [active, setActive] = useState("home");
  // A single toggle, independent of which page is active — the logo only
  // ever folds/unfolds the panel in place, it never navigates. Starts folded
  // since the app opens on the home page's immersive hero.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const Page = PAGES[active] ?? Home;

  return (
    // The sidebar is a fixed overlay (see Sidebar.jsx), not a flex sibling —
    // this padding reserves space for just the folded rail's width, always,
    // so opening the panel floats it over the page instead of resizing/
    // pushing this content.
    <div className="min-h-screen lg:pl-[76px]">
      <Sidebar
        active={active}
        folded={!sidebarOpen}
        onNavigate={setActive}
        onLogoClick={() => setSidebarOpen((open) => !open)}
      />
      <main className="min-w-0 px-6 lg:px-10 py-8 max-w-[1180px] mx-auto w-full">
        <Page onNavigate={setActive} />
        <footer className="mt-16 mb-6 text-[11.5px] text-center" style={{ color: "var(--text-tertiary)" }}>
          Refracto — Explainable AI Framework for Credit Risk Assessment · XGBoost + SHAP
        </footer>
      </main>
    </div>
  );
}

export default App;
