import { useEffect, useRef, useState } from "react";

/**
 * Full-bleed (100vw, ignores the app's padded/max-width main column) hero
 * video pinned behind `children` while scrolling through `wrapperRef`'s box:
 * scrubbed (currentTime tied to scroll progress) while pinned, then released
 * — translated up and off-screen in step with scroll instead of staying
 * fixed forever — once the wrapper's bottom edge nears the viewport bottom,
 * so whatever comes after (e.g. the app footer) isn't permanently hidden
 * beneath it. Always position:fixed (never switches to absolute), so the
 * release phase can't inherit a narrower containing block from an ancestor
 * and lose the full-bleed width.
 */
export function ScrollVideo({ src, wrapperRef, children }) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    const container = containerRef.current;
    const wrapper = wrapperRef.current;
    if (!video || !container || !wrapper) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      video.loop = true;
      video.play().catch(() => {});
      setReady(true);
    }

    // Reduced-motion still needs the release-on-scroll behavior below (so the
    // pinned video slides away instead of permanently covering the page) —
    // it only skips the scrubbing step, since the video is already
    // autoplaying/looping on its own in that case.
    const update = () => {
      const rect = wrapper.getBoundingClientRect();
      const vh = window.innerHeight;

      const releaseOffset = Math.min(0, rect.bottom - vh);
      container.style.transform = `translateY(${releaseOffset}px)`;

      if (!reducedMotion && video.duration) {
        const scrollable = rect.height - vh;
        const progress = scrollable > 0 ? Math.min(1, Math.max(0, -rect.top / scrollable)) : 0;
        video.currentTime = progress * video.duration;
      }
    };
    // Scroll fires far faster than the video can actually seek — setting
    // currentTime synchronously on every event queues up seeks faster than
    // the decoder can service them, which is what made scrubbing feel slow.
    // Coalescing to one update per animation frame keeps it in step with
    // what the browser can actually paint.
    let rafId = null;
    const onScroll = () => {
      if (rafId != null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        update();
      });
    };
    const onLoaded = () => {
      setReady(true);
      update();
    };

    video.addEventListener("loadedmetadata", onLoaded);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    update();

    return () => {
      video.removeEventListener("loadedmetadata", onLoaded);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (rafId != null) cancelAnimationFrame(rafId);
    };
  }, [wrapperRef]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        zIndex: 0,
        display: "flex",
        flexDirection: "column",
        willChange: "transform",
      }}
    >
      {/* Bottom edge fades to transparent always (not just during release) —
          so as the box translates away on scroll, what's revealed underneath
          emerges through a soft dissolve instead of the box's hard bottom
          edge cutting straight across it. Scoped to just the video/wash/
          vignette group so the headline/CTA overlay stays fully legible. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          maskImage: "linear-gradient(to bottom, black 0%, black 72%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 72%, transparent 100%)",
        }}
      >
        <video
          ref={videoRef}
          src={src}
          muted
          playsInline
          preload="auto"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: ready ? 1 : 0,
            transition: "opacity 1.2s ease",
          }}
        />
        {/* Legibility wash for the overlaid headline/CTAs, heavier top and bottom. */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background: "linear-gradient(180deg, rgba(6,13,26,0.55) 0%, rgba(6,13,26,0.2) 45%, rgba(6,13,26,0.62) 100%)",
          }}
        />
        {/* Vignette — dissolves the video's rectangular edges into the page's own
            background color instead of a hard cutoff, strongest along the left
            edge where the folded sidebar rail sits so the video bleeds through it. */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background: `
              radial-gradient(ellipse 100% 85% at 50% 45%, transparent 55%, var(--bg) 100%),
              linear-gradient(90deg, var(--bg) 0%, transparent 12%)
            `,
          }}
        />
      </div>
      {/* Positioned (not static) so it stacks above the absolute overlay divs above
          regardless of DOM order — static content paints below positioned siblings. */}
      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        {children}
      </div>
    </div>
  );
}
