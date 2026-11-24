"use client";

import { useEffect, useState, useSyncExternalStore, type RefObject } from "react";

function useMediaQuery(query: string, serverValue: boolean): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

export const useReducedMotion = () => useMediaQuery("(prefers-reduced-motion: reduce)", false);
/** Server renders the desktop layout; phones switch after hydration. */
export const useIsNarrow = () => useMediaQuery("(max-width: 860px)", false);

/**
 * Tracks how far the page has scrolled through `ref`'s element, 0 at its top edge reaching the
 * viewport top, 1 when its bottom reaches the viewport bottom. Writes `--p` on the element for CSS
 * and calls `onProgress` once per frame. Does nothing while `enabled` is false.
 */
export function useScrollProgress(
  ref: RefObject<HTMLElement | null>,
  onProgress?: (p: number) => void,
  enabled = true,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) {
      el?.style.setProperty("--p", "0");
      return;
    }
    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      const travel = rect.height - window.innerHeight;
      const p = travel > 0 ? Math.min(Math.max(-rect.top / travel, 0), 1) : 0;
      el.style.setProperty("--p", p.toFixed(4));
      onProgress?.(p);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [ref, onProgress, enabled]);
}

/** True once the element has entered the viewport; never goes back to false. */
export function useSeenOnce(ref: RefObject<Element | null>, rootMargin = "0px 0px -12% 0px"): boolean {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin, seen]);
  return seen;
}

/** onError for store photos: a dead image URL leaves the frame's background instead of a broken-image icon. */
export const hide = (e: React.SyntheticEvent<HTMLImageElement>) => {
  e.currentTarget.style.visibility = "hidden";
};
