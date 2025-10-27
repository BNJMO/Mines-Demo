export function tween(
  app,
  { duration = 300, update, complete, ease = (t) => t, skipUpdate = false }
) {
  const start = performance.now();
  const step = () => {
    const t = Math.min(1, (performance.now() - start) / duration);
    if (!skipUpdate || t >= 1) {
      const progress = skipUpdate && t >= 1 ? 1 : t;
      update?.(ease(progress));
    }
    if (t >= 1) {
      app.ticker.remove(step);
      complete?.();
    }
  };
  app.ticker.add(step);
}
