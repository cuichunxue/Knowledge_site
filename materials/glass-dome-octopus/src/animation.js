// STEP 4 — animation control.
//
// Holds the explode state {p, ind} that explosion.render() draws, and moves it over time with simple tweens.
// Every tween starts from the CURRENT value, so a reverse in the middle (explode -> reassemble, open -> close,
// part A -> part B) is always smooth and never jumps. Time comes from performance.now(), scaled by `speed`
// (the tests run at 6x). Nothing here touches the scene: the scene is a pure function of the state.
import {PARTS} from './explosion.js';

export const TIMING = {
  highlight: 0.2, // s, the outline pulse before a part moves
  open: 1.2, // s, unlock 0.2 + separation 1.0
  close: 0.6, // s, a part going back
  explode: 7.0, // s, the full exploded view, all parts in order
  assemble: 1.6, // s, the full reassembly ("一瞬で再組み立て")
};

export function createAnimator() {
  const state = {p: 0, ind: Object.fromEntries(PARTS.map((p) => [p.id, 0]))};
  let speed = 1;
  let clock = 0; // scaled seconds
  let last = performance.now();
  let global = null; // {from, to, t0, dur}
  let paused = false;
  const parts = new Map(); // id -> {from, to, t0, dur}
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

  const tick = () => {
    const now = performance.now();
    const dt = Math.min(0.25, (now - last) / 1000) * speed;
    last = now;
    let moving = false;
    if (global && !paused) {
      clock += dt;
      const k = Math.min(1, Math.max(0, (clock - global.t0) / global.dur));
      state.p = global.from + (global.to - global.from) * (global.linear ? k : ease(k));
      if (k >= 1) global = null;
      moving = true;
    } else if (!paused) clock += dt;
    for (const [id, tw] of parts) {
      if (paused) continue; // paused: nothing moves, nothing to redraw
      const k = Math.min(1, Math.max(0, (clock - tw.t0) / tw.dur));
      state.ind[id] = tw.from + (tw.to - tw.from) * k; // linear: the part's own easing lives in explosion.js
      if (k >= 1) parts.delete(id);
      moving = true;
    }
    return moving;
  };
  const partTo = (id, to, dur, delay = 0) => {
    const from = state.ind[id];
    if (Math.abs(from - to) < 1e-6 && !parts.has(id)) return;
    parts.set(id, {from, to, t0: clock + delay, dur: dur * Math.abs(to - from || 1)});
  };

  return {
    state,
    tick,
    get playing() {
      return !!global && !paused;
    },
    get busy() {
      return !!global || parts.size > 0;
    },
    get paused() {
      return paused;
    },
    /** global explode toward `to` (1 = exploded, 0 = assembled) */
    playGlobal(to, dur = to > state.p ? TIMING.explode : TIMING.assemble) {
      paused = false;
      const span = Math.abs(to - state.p);
      if (span < 1e-6) return;
      // the explode runs linearly through the part windows (each part eases itself); the reassembly eases
      global = {from: state.p, to, t0: clock, dur: dur * span, linear: to > state.p};
    },
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
      last = performance.now();
    },
    /** slider: jump the global progress, stopping any global tween */
    setP(v) {
      global = null;
      state.p = Math.min(1, Math.max(0, v));
    },
    open(id) {
      paused = false;
      partTo(id, 1, TIMING.open, TIMING.highlight);
    },
    close(id) {
      paused = false;
      partTo(id, 0, TIMING.close);
    },
    /** everything back: global to 0 and every part closed */
    assembleAll(dur = TIMING.assemble) {
      this.playGlobal(0, dur);
      for (const p of PARTS) partTo(p.id, 0, TIMING.close);
    },
    /** instantly back to rest (safe restore) */
    snapHome() {
      global = null;
      parts.clear();
      paused = false;
      state.p = 0;
      for (const k in state.ind) state.ind[k] = 0;
    },
    setSpeed(v) {
      speed = v;
    },
  };
}
