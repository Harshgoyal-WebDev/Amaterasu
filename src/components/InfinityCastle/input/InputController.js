import { MOTION } from "../config";
import { pointer } from "../state";

/**
 * Turns wheel / trackpad / touch / keyboard / on-screen buttons into movement
 * *intent* — never camera positions. Separate channels:
 *
 *   impulse      forward / backward velocity kicks (wheel, swipe)
 *   axis         held forward / backward keys (-1..1)
 *   lateral      sideways drift in metres (horizontal wheel, shift+wheel, swipe)
 *   lateralAxis  held left / right keys (-1..1)
 *   preference   branch choice for the next junction (left/right/up/down/forward)
 *
 * Wheel deltas are normalised across delta modes and clamped per event, so a
 * single aggressive notch can't throw the camera across several rooms.
 * Small horizontal noise from trackpads is ignored (deadzone + dominance).
 * Listeners go on the experience element (wheel / touch) and window (keys),
 * and are removed on detach. The browser never scrolls the page here; only
 * elements marked data-ic-scroll (the summons letter) scroll natively.
 */

const FORWARD_KEYS = new Set(["ArrowUp", "KeyW"]);
const BACK_KEYS = new Set(["ArrowDown", "KeyS"]);
const LEFT_KEYS = new Set(["ArrowLeft", "KeyA"]);
const RIGHT_KEYS = new Set(["ArrowRight", "KeyD"]);
const UP_KEYS = new Set(["KeyE", "KeyR"]);
const DOWN_KEYS = new Set(["KeyQ", "KeyF"]);

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const inScrollable = (e) => e.target instanceof Element && !!e.target.closest("[data-ic-scroll]");

export class InputController {
  constructor({ reducedMotion = false } = {}) {
    this.enabled = false;
    this.held = false; // e.g. while the summons letter is open
    this.reducedMotion = reducedMotion;
    this.impulse = 0;
    this.lateral = 0;
    this.lateralAcc = 0;
    this.verticalAcc = 0;
    this.preference = null;
    this.keys = { forward: false, back: false, left: false, right: false };
    this.touch = null;
    this.el = null;
    this.out = { impulse: 0, axis: 0, lateral: 0, lateralAxis: 0, preference: null, boost: 1 };
    this.scrolled = 0; // px of forward/back scrolling since the last frame
    this.rate = 0; // smoothed scrolling rate (px/s)
    this.lastInputAt = 0;
  }

  enable(on = true) {
    this.enabled = on;
  }

  hold(on = true) {
    this.held = on;
  }

  get active() {
    return this.enabled && !this.held;
  }

  setReducedMotion(on) {
    this.reducedMotion = on;
  }

  attach(el) {
    this.el = el;
    el.addEventListener("wheel", this.onWheel, { passive: false });
    el.addEventListener("touchstart", this.onTouchStart, { passive: true });
    el.addEventListener("touchmove", this.onTouchMove, { passive: false });
    el.addEventListener("touchend", this.onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", this.onTouchEnd, { passive: true });
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    el.addEventListener("pointermove", this.onPointerMove, { passive: true });
    el.addEventListener("pointerleave", this.onPointerLeave, { passive: true });
  }

  detach() {
    const el = this.el;
    if (el) {
      el.removeEventListener("wheel", this.onWheel);
      el.removeEventListener("touchstart", this.onTouchStart);
      el.removeEventListener("touchmove", this.onTouchMove);
      el.removeEventListener("touchend", this.onTouchEnd);
      el.removeEventListener("touchcancel", this.onTouchEnd);
    }
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    if (el) {
      el.removeEventListener("pointermove", this.onPointerMove);
      el.removeEventListener("pointerleave", this.onPointerLeave);
    }
    this.onPointerLeave();
    this.el = null;
  }

  // ── channels ─────────────────────────────────────────────────────────
  forward(px, gain = MOTION.wheelGain) {
    if (!this.active) return;
    const scale = this.reducedMotion ? 0.75 : 1;
    const c = clamp(px, -MOTION.maxWheelDelta, MOTION.maxWheelDelta);
    this.impulse += c * gain * scale;
    this.scrolled += Math.abs(c) * (gain / MOTION.wheelGain);
    this.lastInputAt = performance.now();
  }

  sideways(px, gainScale = 1) {
    if (!this.active) return;
    this.lateral += px * MOTION.lateralGain * gainScale;
    this.lateralAcc += px * gainScale;
    if (this.lateralAcc > MOTION.preferenceThreshold) {
      this.choose("right");
      this.lateralAcc = 0;
    } else if (this.lateralAcc < -MOTION.preferenceThreshold) {
      this.choose("left");
      this.lateralAcc = 0;
    }
  }

  /** Branch choice for the next junction (also used by on-screen controls). */
  choose(dir) {
    if (!this.active) return;
    this.preference = dir;
    this.lastInputAt = performance.now();
  }

  /** On-screen "step forward" control. */
  step(direction = 1) {
    this.forward(110 * direction);
  }

  // ── events ───────────────────────────────────────────────────────────
  onWheel = (e) => {
    if (e.ctrlKey) return; // pinch-zoom gesture on trackpads: leave it to the browser
    if (inScrollable(e)) return;
    e.preventDefault();
    let dy = e.deltaY;
    let dx = e.deltaX;
    if (e.deltaMode === 1) {
      dy *= 16;
      dx *= 16;
    } else if (e.deltaMode === 2) {
      dy *= window.innerHeight;
      dx *= window.innerWidth;
    }
    if (e.shiftKey && Math.abs(dx) < 1) {
      dx = dy;
      dy = 0;
    }
    if (dy) this.forward(dy);
    if (Math.abs(dx) > MOTION.lateralDeadzone && Math.abs(dx) > Math.abs(dy) * MOTION.lateralDominance) this.sideways(clamp(dx, -MOTION.maxWheelDelta, MOTION.maxWheelDelta));
  };

  onTouchStart = (e) => {
    if (e.touches.length !== 1 || inScrollable(e)) {
      this.touch = null;
      return;
    }
    const t = e.touches[0];
    this.touch = { x: t.clientX, y: t.clientY, sx: t.clientX, sy: t.clientY, lock: null };
  };

  onTouchMove = (e) => {
    const s = this.touch;
    if (!s || e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = s.x - t.clientX;
    const dy = s.y - t.clientY;
    s.x = t.clientX;
    s.y = t.clientY;
    if (!s.lock) {
      const tx = s.sx - t.clientX;
      const ty = s.sy - t.clientY;
      if (Math.hypot(tx, ty) < 9) return;
      s.lock = Math.abs(ty) >= Math.abs(tx) ? "v" : "h";
    }
    if (e.cancelable) e.preventDefault();
    if (s.lock === "v") this.forward(dy * 2.2, MOTION.touchGain / 2.2);
    else this.sideways(dx * 1.4, 1.6);
  };

  onTouchEnd = () => {
    this.touch = null;
  };

  onKeyDown = (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const target = e.target;
    if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
    const c = e.code;
    let handled = true;
    if (FORWARD_KEYS.has(c)) this.keys.forward = true;
    else if (BACK_KEYS.has(c)) this.keys.back = true;
    else if (LEFT_KEYS.has(c)) {
      this.keys.left = true;
      if (!e.repeat) this.choose("left");
    } else if (RIGHT_KEYS.has(c)) {
      this.keys.right = true;
      if (!e.repeat) this.choose("right");
    } else if (UP_KEYS.has(c)) {
      if (!e.repeat) this.choose("up");
    } else if (DOWN_KEYS.has(c)) {
      if (!e.repeat) this.choose("down");
    } else if (c === "Space" || c === "PageDown") {
      if (target?.tagName === "BUTTON" && c === "Space") return; // let buttons activate
      this.forward((e.shiftKey ? -1 : 1) * MOTION.maxWheelDelta);
    } else if (c === "PageUp") this.forward(-MOTION.maxWheelDelta);
    else handled = false;
    if (handled) {
      if (this.active) e.preventDefault();
      this.lastInputAt = performance.now();
    }
  };

  onKeyUp = (e) => {
    const c = e.code;
    if (FORWARD_KEYS.has(c)) this.keys.forward = false;
    else if (BACK_KEYS.has(c)) this.keys.back = false;
    else if (LEFT_KEYS.has(c)) this.keys.left = false;
    else if (RIGHT_KEYS.has(c)) this.keys.right = false;
  };

  onBlur = () => {
    this.keys.forward = this.keys.back = this.keys.left = this.keys.right = false;
    this.touch = null;
    this.onPointerLeave();
  };

  // mouse parallax (pen / touch ignored: dragging is movement there)
  onPointerMove = (e) => {
    if (e.pointerType !== "mouse") return;
    const r = this.el.getBoundingClientRect();
    pointer.x = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1);
    pointer.y = clamp(-(((e.clientY - r.top) / r.height) * 2 - 1), -1, 1);
    pointer.active = true;
  };

  onPointerLeave = () => {
    pointer.x = pointer.y = 0;
    pointer.active = false;
  };

  /** Consume accumulated intent for this frame. */
  read(dt) {
    const o = this.out;
    if (!this.active) {
      o.impulse = o.axis = o.lateral = o.lateralAxis = 0;
      o.preference = null;
      o.boost = 1;
      this.impulse = this.lateral = this.scrolled = this.rate = 0;
      return o;
    }
    // scrolling fast: each notch pushes harder, and the top speed rises with it
    if (dt > 0) this.rate += (this.scrolled / dt - this.rate) * (1 - Math.exp(-dt / 0.2));
    this.scrolled = 0;
    o.boost = 1 + clamp((this.rate - MOTION.boostFrom) / MOTION.boostRange, 0, 1) * MOTION.boost;
    o.impulse = this.impulse * o.boost;
    o.axis = (this.keys.forward ? 1 : 0) - (this.keys.back ? 1 : 0);
    o.lateral = this.lateral;
    o.lateralAxis = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0);
    o.preference = this.preference;
    this.impulse = 0;
    this.lateral = 0;
    this.preference = null;
    this.lateralAcc *= Math.exp(-dt / 0.35);
    return o;
  }
}
