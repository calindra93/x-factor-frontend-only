const MIN_TARGET = 44;

const TARGET_SELECTORS = [
  "button",
  "[role='button']",
  "a[data-tap-target]",
  ".touch-target",
  ".icon-button",
  "input[type='checkbox']",
  "input[type='radio']",
  "[data-tap-target]",
].join(",");

export function runTapTargetAudit() {
  if (typeof window === "undefined") return;

  const candidates = Array.from(document.querySelectorAll(TARGET_SELECTORS));
  const violations = candidates
    .map((el) => {
      const rect = el.getBoundingClientRect();
      return {
        element: el,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    })
    .filter(({ width, height }) => width < MIN_TARGET || height < MIN_TARGET);

  if (!violations.length) {
    console.info(`[tap-target-audit] Pass: ${candidates.length} controls checked.`);
    return;
  }

  console.warn(
    `[tap-target-audit] ${violations.length} controls under ${MIN_TARGET}x${MIN_TARGET}.`,
    violations.slice(0, 20).map((v) => ({
      width: v.width,
      height: v.height,
      element: v.element,
    }))
  );
}

export function enableTapTargetAudit() {
  if (typeof window === "undefined") return;

  const schedule = () => window.requestAnimationFrame(runTapTargetAudit);
  schedule();

  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true });

  window.addEventListener("resize", schedule);

  return () => {
    observer.disconnect();
    window.removeEventListener("resize", schedule);
  };
}
