import Box from "@mui/material/Box";
import type { ReactNode } from "react";
import { useRevealOnce } from "../hooks/useRevealOnce";

type Props = {
  children: ReactNode;
  // Position in a staggered group; the delay is capped so long groups don't lag.
  index?: number;
  // How far (px) the element rises while fading in.
  distance?: number;
  durationMs?: number;
  staggerMs?: number;
  maxStaggerSteps?: number;
};

// Fades in and rises slightly the first time it scrolls into view, once.
// Animates only opacity and transform; with reduced motion it shows at once.
export default function Reveal({
  children,
  index = 0,
  distance = 16,
  durationMs = 500,
  staggerMs = 80,
  maxStaggerSteps = 6,
}: Props) {
  const { ref, revealed, reducedMotion } = useRevealOnce<HTMLDivElement>();
  const delay = Math.min(index, maxStaggerSteps) * staggerMs;

  return (
    <Box
      ref={ref}
      sx={{
        height: "100%",
        opacity: revealed ? 1 : 0,
        transform: revealed ? "none" : `translateY(${distance}px)`,
        transition: reducedMotion
          ? "none"
          : `opacity ${durationMs}ms ease-out ${delay}ms, transform ${durationMs}ms ease-out ${delay}ms`,
      }}
    >
      {children}
    </Box>
  );
}
