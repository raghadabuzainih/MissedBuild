import useMediaQuery from "@mui/material/useMediaQuery";
import { useCallback, useState } from "react";

// One IntersectionObserver shared by every revealed element.
const onVisible = new WeakMap<Element, () => void>();
let observer: IntersectionObserver | null = null;

function sharedObserver(): IntersectionObserver {
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer!.unobserve(entry.target);
        onVisible.get(entry.target)?.();
        onVisible.delete(entry.target);
      }
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.1 },
  );
  return observer;
}

const supported = typeof IntersectionObserver !== "undefined";

export function usePrefersReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)", { noSsr: true });
}

// `revealed` turns true once, the first time the element scrolls into view.
// With reduced motion (or no observer support) everything is shown at once.
export function useRevealOnce<T extends Element>() {
  const reducedMotion = usePrefersReducedMotion();
  const [revealed, setRevealed] = useState(!supported);

  const ref = useCallback((node: T | null) => {
    if (!node || !supported) return;
    const shared = sharedObserver();
    onVisible.set(node, () => setRevealed(true));
    shared.observe(node);
    return () => {
      shared.unobserve(node);
      onVisible.delete(node);
    };
  }, []);

  return { ref, revealed: revealed || reducedMotion, reducedMotion };
}
