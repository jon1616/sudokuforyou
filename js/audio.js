// Suoni delicati sintetizzati (niente file audio) e vibrazione leggera.
// Rispettano le impostazioni "sounds" e "vibration".

import { settings } from "./settings.js";

let ctx = null;
function audio() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function tone(freq, delay, dur, vol = 0.06, type = "sine") {
  const c = audio();
  if (!c) return;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  const t = c.currentTime + delay;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

const SOUNDS = {
  place: () => tone(523, 0, 0.14, 0.05),
  note: () => tone(880, 0, 0.07, 0.025),
  erase: () => tone(330, 0, 0.1, 0.035),
  unit: () => [659, 784, 988].forEach((f, k) => tone(f, k * 0.07, 0.3, 0.04)),
  win: () => [523, 659, 784, 1047, 1319].forEach((f, k) => tone(f, k * 0.11, 0.6, 0.05)),
  hint: () => [784, 988].forEach((f, k) => tone(f, k * 0.08, 0.2, 0.035)),
};
const VIBES = {
  place: 8,
  note: 5,
  erase: 8,
  unit: [12, 50, 12],
  win: [25, 70, 25, 70, 50],
  hint: 10,
};

export function feedback(kind) {
  if (settings.sounds) try { SOUNDS[kind]?.(); } catch {}
  if (settings.vibration && navigator.vibrate) try { navigator.vibrate(VIBES[kind] || 8); } catch {}
}
