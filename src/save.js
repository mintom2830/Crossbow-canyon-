// localStorage persistence. Every access is guarded: private windows,
// blocked storage or quota errors simply fall back to defaults.
const KEYS = {
  settings: 'crossbow-canyon:settings:v1',
  progress: 'crossbow-canyon:progress:v1',
  checkpoint: 'crossbow-canyon:checkpoint:v1',
  waveStart: 'crossbow-canyon:wave-start:v1',
};

export const DEFAULT_SETTINGS = { sfx: true, music: true, quality: 'auto', tutorialDone: false, autoSkip: false, speed: 1, difficulty: 'normal', level: 1, ride: 'none', skin: 'classic' };
export const DEFAULT_PROGRESS = { bestWave: 0, cleared: false, bestStars: 0, games: 0, diamonds: 0, clears: 0, unlocks: { cannon: false, horse: false, cow: false }, skins: ['classic'], byLevel: {} };

export const Save = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(KEYS[key]);
      if (!raw) return structuredCloneSafe(fallback);
      const v = JSON.parse(raw);
      return fallback && typeof fallback === 'object' && !Array.isArray(fallback) ? { ...fallback, ...v } : v;
    } catch { return structuredCloneSafe(fallback); }
  },
  set(key, value) {
    try { localStorage.setItem(KEYS[key], JSON.stringify(value)); return true; } catch { return false; }
  },
  del(key) { try { localStorage.removeItem(KEYS[key]); } catch { /* ignore */ } },
  clearAll() { for (const k of Object.keys(KEYS)) this.del(k); },
};

function structuredCloneSafe(v) { return v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v; }
