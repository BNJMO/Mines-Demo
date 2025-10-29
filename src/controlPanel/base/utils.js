export function resolveMount(mount) {
  if (!mount) {
    throw new Error("Control panel mount target is required");
  }

  if (typeof mount === "string") {
    const element = document.querySelector(mount);
    if (!element) {
      throw new Error(`Control panel mount '${mount}' not found`);
    }
    return element;
  }

  return mount;
}

export function clampToZero(value) {
  return Math.max(0, value);
}
