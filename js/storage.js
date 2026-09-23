// Salvataggi nel telefono (localStorage). Mai un errore se lo spazio non è disponibile.
const PREFIX = "sfy.";

export function load(key, fallback = null) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {}
}

export function remove(key) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {}
}
