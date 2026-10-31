import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { usePrefersReducedMotion } from "./useRevealOnce";

// How far below the sticky header a section's top must be before it counts as
// the one being read: a single line, so the result depends only on the scroll
// position and cannot flicker back and forth at a boundary.
const LINE_BELOW_HEADER = 0.25; // of the visible height under the header
// After a click, the highlight stays on the target while the smooth scroll
// passes other sections; it is released once scrolling has stopped this long.
const SETTLE_MS = 150;
// Fail-safe in case no scroll event arrives (e.g. the page is already there).
const MAX_LOCK_MS = 1_500;

type Lock = { settle: number | undefined; failSafe: number };

// The section of `ids` (in page order) currently in view, below the sticky
// header in `headerRef`. Above the first section the first id is active; at
// the very bottom the last one is (a short last section may never reach the
// line). `scrollTo` scrolls smoothly to a section and marks it active at once.
export function useScrollSpy(ids: string[], headerRef: RefObject<HTMLElement | null>, enabled: boolean) {
  const [active, setActive] = useState<string | null>(ids[0] ?? null);
  const reducedMotion = usePrefersReducedMotion();
  const lock = useRef<Lock | null>(null);
  const idsKey = ids.join(",");

  const compute = useCallback(() => {
    const list = idsKey.split(",");
    const header = headerRef.current?.getBoundingClientRect().bottom ?? 0;
    const line = header + (window.innerHeight - header) * LINE_BELOW_HEADER;
    const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
    if (atBottom) return list.at(-1) ?? null;
    let current = list[0] ?? null;
    for (const id of list) {
      const element = document.getElementById(id);
      if (element && element.getBoundingClientRect().top <= line) current = id;
    }
    return current;
  }, [idsKey, headerRef]);

  const clearLock = () => {
    if (!lock.current) return;
    window.clearTimeout(lock.current.settle);
    window.clearTimeout(lock.current.failSafe);
    lock.current = null;
  };

  const release = useCallback(() => {
    clearLock();
    setActive(compute());
  }, [compute]);

  useEffect(() => {
    if (!enabled) return;
    let frame = requestAnimationFrame(() => setActive(compute()));
    const onScroll = () => {
      if (lock.current) {
        // A click's smooth scroll is still running: keep its target highlighted.
        window.clearTimeout(lock.current.settle);
        lock.current.settle = window.setTimeout(release, SETTLE_MS);
        return;
      }
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setActive(compute()));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      clearLock();
    };
  }, [enabled, compute, release]);

  const scrollTo = useCallback(
    (id: string) => {
      const element = document.getElementById(id);
      if (!element) return;
      const header = headerRef.current?.offsetHeight ?? 0;
      const top = element.getBoundingClientRect().top + window.scrollY - header;
      clearLock();
      lock.current = { settle: undefined, failSafe: window.setTimeout(release, MAX_LOCK_MS) };
      setActive(id);
      window.scrollTo({ top: Math.max(0, top), behavior: reducedMotion ? "instant" : "smooth" });
    },
    [headerRef, release, reducedMotion],
  );

  return { active, scrollTo };
}
