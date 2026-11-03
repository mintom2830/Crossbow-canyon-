// Keyboard (WASD / arrows) and a floating virtual joystick (touch or mouse
// drag). Produces a movement vector in screen space: x = right, z = down.
const KEYS = {
  KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
};

export class Input {
  constructor(surface, joyEl, handlers = {}) {
    this.surface = surface;
    this.joyEl = joyEl;
    this.knob = joyEl.firstElementChild;
    this.handlers = handlers;
    this.keys = new Set();
    this.joy = null; // {id, x0, y0, dx, dy}
    this.radius = 56;
    this.enabled = true;
    this.lastKind = matchMedia('(pointer: coarse)').matches ? 'touch' : 'keys';

    window.addEventListener('keydown', (e) => {
      if (KEYS[e.code]) { this.keys.add(e.code); this.lastKind = 'keys'; if (this.enabled) e.preventDefault(); }
      else if (e.code === 'Escape' || e.code === 'KeyP') { handlers.onPause?.(); e.preventDefault(); }
      else if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) { if (handlers.onAction?.()) e.preventDefault(); }
      else if (!e.repeat && (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'KeyQ' || e.code === 'KeyT' || e.code === 'KeyF' || e.code === 'Numpad1' || e.code === 'Numpad2')) handlers.onKey?.(e.code);
    });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    window.addEventListener('blur', () => { this.keys.clear(); this._endJoy(); });

    surface.addEventListener('pointerdown', (e) => {
      if (!this.enabled || this.joy) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      try { surface.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      this.joy = { id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0 };
      this.lastKind = e.pointerType === 'mouse' ? 'mouse' : 'touch';
      joyEl.style.left = e.clientX + 'px';
      joyEl.style.top = e.clientY + 'px';
      this.knob.style.transform = 'translate(0px, 0px)';
      joyEl.hidden = false;
      surface.focus({ preventScroll: true });
      handlers.onInteract?.();
    });
    surface.addEventListener('pointermove', (e) => {
      if (!this.joy || e.pointerId !== this.joy.id) return;
      e.preventDefault();
      let dx = e.clientX - this.joy.x0, dy = e.clientY - this.joy.y0;
      const d = Math.hypot(dx, dy), R = this.radius;
      if (d > R * 1.6) {
        // drag the base along so the stick never feels stuck
        const k = (d - R * 1.6) / d;
        this.joy.x0 += dx * k; this.joy.y0 += dy * k;
        joyEl.style.left = this.joy.x0 + 'px'; joyEl.style.top = this.joy.y0 + 'px';
        dx = e.clientX - this.joy.x0; dy = e.clientY - this.joy.y0;
      }
      const l = Math.hypot(dx, dy);
      const c = l > R ? R / l : 1;
      this.joy.dx = dx * c; this.joy.dy = dy * c;
      this.knob.style.transform = `translate(${this.joy.dx}px, ${this.joy.dy}px)`;
    });
    const end = (e) => { if (this.joy && e.pointerId === this.joy.id) this._endJoy(); };
    surface.addEventListener('pointerup', end);
    surface.addEventListener('pointercancel', end);
    surface.addEventListener('lostpointercapture', end);
    surface.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _endJoy() {
    this.joy = null;
    this.joyEl.hidden = true;
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) { this._endJoy(); this.keys.clear(); }
  }

  vector() {
    if (!this.enabled) return { x: 0, z: 0 };
    if (this.joy) {
      const R = this.radius;
      let x = this.joy.dx / R, z = this.joy.dy / R;
      const l = Math.hypot(x, z);
      if (l < 0.14) return { x: 0, z: 0 };
      const k = Math.min(1, (l - 0.14) / 0.7) / l; // dead zone + quick ramp to full speed
      return { x: x * k, z: z * k };
    }
    let x = 0, z = 0;
    for (const k of this.keys) { const v = KEYS[k]; if (v) { x += v[0]; z += v[1]; } }
    const l = Math.hypot(x, z);
    return l > 0 ? { x: x / l, z: z / l } : { x: 0, z: 0 };
  }
}
