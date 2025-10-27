export function createSoundManager({ sound, effectPaths, aliases }) {
  const enabledKeys = new Set(
    Object.entries(effectPaths)
      .filter(([, value]) => Boolean(value))
      .map(([key]) => key)
  );

  function loadEffect(key, path) {
    if (!enabledKeys.has(key) || !path) {
      return Promise.resolve();
    }

    const alias = aliases[key];
    if (!alias) {
      return Promise.resolve();
    }

    if (sound.exists?.(alias)) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      sound.add(alias, {
        url: path,
        preload: true,
        loaded: resolve,
        error: resolve,
      });
    });
  }

  async function loadAll() {
    const loaders = Object.entries(effectPaths).map(([key, path]) =>
      loadEffect(key, path)
    );

    await Promise.all(loaders);
  }

  function play(key, options = {}) {
    if (!enabledKeys.has(key)) return;

    const alias = aliases[key];
    if (!alias) return;

    try {
      sound.play(alias, options);
    } catch (err) {
      // Ignore playback errors so they don't interrupt gameplay
    }
  }

  return {
    loadAll,
    play,
  };
}
