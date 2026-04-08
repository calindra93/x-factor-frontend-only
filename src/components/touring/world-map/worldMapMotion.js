// ═══════════════════════════════════════════════════════════════════════════════
// WORLD MAP — Shared Framer Motion constants
// ═══════════════════════════════════════════════════════════════════════════════

export const dockTransition = {
  type: "spring",
  stiffness: 240,
  damping: 28,
  mass: 0.9,
};

export const fadeUp = {
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 10 },
  transition: dockTransition,
};

export const fadeSide = {
  initial: { opacity: 0, x: 22 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 14 },
  transition: dockTransition,
};

export const pulseTransition = {
  repeat: Infinity,
  repeatType: "mirror",
  duration: 1.8,
};

// Panel swap animation — directional slide with spring physics
export const panelSlideVariants = {
  enter: (direction) => ({
    opacity: 0,
    x: (direction || 1) * 32,
    y: 8,
  }),
  center: {
    opacity: 1,
    x: 0,
    y: 0,
    transition: { type: "spring", stiffness: 220, damping: 26, mass: 0.8 },
  },
  exit: (direction) => ({
    opacity: 0,
    x: (direction || 1) * -20,
    transition: { duration: 0.16 },
  }),
};
