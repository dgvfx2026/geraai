// GeraAI — storage.js
// Helpers de localStorage para favoritos, histórico e preferências.

const KEYS = {
  HISTORY: 'geraai_history',
  FAVORITES: 'geraai_favorites',
  LANGUAGE: 'geraai_language',
  THEME: 'geraai_theme',
  IMAGE_HISTORY: 'geraai_image_history',
};

const MAX_HISTORY = 50;
const MAX_IMAGE_HISTORY = 10;

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('GeraAI storage error:', e);
  }
}

// ─── Histórico de Prompts ───────────────────────────────────────────────────

export function addToHistory(entry) {
  const history = load(KEYS.HISTORY, []);
  history.unshift({ ...entry, id: Date.now(), savedAt: new Date().toISOString() });
  if (history.length > MAX_HISTORY) history.pop();
  save(KEYS.HISTORY, history);
}

export function getHistory() {
  return load(KEYS.HISTORY, []);
}

export function clearHistory() {
  save(KEYS.HISTORY, []);
}

export function removeFromHistory(id) {
  const history = load(KEYS.HISTORY, []);
  save(KEYS.HISTORY, history.filter(h => h.id !== id));
}

// ─── Favoritos ──────────────────────────────────────────────────────────────

export function addToFavorites(entry) {
  const favs = load(KEYS.FAVORITES, []);
  const exists = favs.find(f => f.id === entry.id);
  if (!exists) {
    favs.unshift({ ...entry, favoritedAt: new Date().toISOString() });
    save(KEYS.FAVORITES, favs);
    return true;
  }
  return false;
}

export function removeFromFavorites(id) {
  const favs = load(KEYS.FAVORITES, []);
  save(KEYS.FAVORITES, favs.filter(f => f.id !== id));
}

export function getFavorites() {
  return load(KEYS.FAVORITES, []);
}

export function isFavorited(id) {
  return load(KEYS.FAVORITES, []).some(f => f.id === id);
}

// ─── Histórico de Imagens ────────────────────────────────────────────────────

export function addImageToHistory(entry) {
  const history = load(KEYS.IMAGE_HISTORY, []);
  history.unshift({ ...entry, id: Date.now(), savedAt: new Date().toISOString() });
  if (history.length > MAX_IMAGE_HISTORY) history.pop();
  save(KEYS.IMAGE_HISTORY, history);
}

export function getImageHistory() {
  return load(KEYS.IMAGE_HISTORY, []);
}

// ─── Preferências ────────────────────────────────────────────────────────────

export function getLanguage() {
  return load(KEYS.LANGUAGE, 'pt');
}

export function setLanguage(lang) {
  save(KEYS.LANGUAGE, lang);
}

export function getTheme() {
  return load(KEYS.THEME, 'dark');
}

export function setTheme(theme) {
  save(KEYS.THEME, theme);
}
