// 打擊音效：用 Web Audio 即時合成（不用音檔、不用遊戲原音），可關閉並記在瀏覽器
import { store } from './core.js';
const KEY = 'sc.dmSound';
let ac = null, master = null, noiseBuf = null;
export const sfxOn = () => store.get(KEY, true) !== false;
export const setSfx = on => store.set(KEY, !!on);
function ctx() {
  if (!sfxOn()) return null;
  if (!ac) {
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
    ac = new C(); master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.6, ac.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}
function env(g, t, a, peak, dur) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
function noise(t, dur, { type = 'bandpass', f0 = 1200, f1 = 400, q = 1, vol = 0.6 } = {}) {
  const s = ac.createBufferSource(); s.buffer = noiseBuf;
  const f = ac.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
  const g = ac.createGain(); env(g, t, 0.005, vol, dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.05);
}
function tone(t, dur, { f0 = 200, f1 = 60, type = 'sine', vol = 0.7, a = 0.004 } = {}) {
  const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ac.createGain(); env(g, t, a, vol, dur); o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
}
const SOUNDS = {
  swing: t => noise(t, 0.16, { f0: 600, f1: 2600, q: 0.8, vol: 0.25 }),
  hit: t => { tone(t, 0.14, { f0: 160, f1: 55, vol: 0.8 }); noise(t, 0.09, { f0: 2400, f1: 700, vol: 0.45 }); },
  crit: t => { tone(t, 0.22, { f0: 210, f1: 45, vol: 0.9 }); noise(t, 0.16, { f0: 4000, f1: 500, q: 0.6, vol: 0.6 }); tone(t + 0.06, 0.18, { f0: 120, f1: 40, vol: 0.7 }); },
  guard: t => { tone(t, 0.25, { f0: 1250, f1: 1180, type: 'triangle', vol: 0.35 }); tone(t, 0.2, { f0: 1870, f1: 1800, type: 'triangle', vol: 0.2 }); noise(t, 0.05, { f0: 5000, f1: 3000, vol: 0.25 }); },
  magic: t => { [523, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.06, 0.25, { f0: f, f1: f * 1.01, type: 'triangle', vol: 0.18, a: 0.01 })); noise(t, 0.4, { type: 'highpass', f0: 3000, f1: 6000, vol: 0.12 }); },
  ko: t => { tone(t, 0.45, { f0: 120, f1: 30, vol: 0.9 }); noise(t + 0.05, 0.3, { type: 'lowpass', f0: 800, f1: 100, vol: 0.5 }); },
  cheer: t => { [784, 988, 1175].forEach((f, i) => tone(t + i * 0.09, 0.16, { f0: f, f1: f, type: 'square', vol: 0.08, a: 0.005 })); },
};
export function sfx(name) {
  const c = ctx(); if (!c || !SOUNDS[name]) return;
  try { SOUNDS[name](c.currentTime + 0.005); } catch { /* 略 */ }
}
