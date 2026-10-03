// The playback state machine behind the preview: play, pause, restart, seek, loop.
// Plain TypeScript with an injectable scheduler, so it is unit-tested without React or a browser.
// It draws only when the time actually changed; React reads it through useSyncExternalStore.

export interface Scheduler {
  request(callback: (now: number) => void): number;
  cancel(handle: number): void;
}

export interface PlayerState {
  /** Current time in ms, 0..totalMs. */
  t: number;
  playing: boolean;
  loop: boolean;
}

export interface PlayerOptions {
  totalMs: number;
  /** Optional: the canvas often only exists after mount, so it can be supplied later with setDraw. */
  draw?: (t: number) => void;
  scheduler: Scheduler;
  initialT?: number;
  loop?: boolean;
}

export interface Player {
  getState(): PlayerState;
  subscribe(listener: () => void): () => void;
  play(): void;
  pause(): void;
  toggle(): void;
  /** From the start, playing. */
  restart(): void;
  seek(t: number): void;
  setLoop(loop: boolean): void;
  /** Replace the draw function (e.g. once the canvas exists). Call redraw() afterwards to paint. */
  setDraw(draw: (t: number) => void): void;
  /**
   * The poem got a different length (a new pace, a title, another mood). The playhead keeps its place as the same
   * FRACTION of the whole, so a change never throws the viewer back to the start. Playing carries on.
   */
  setTotal(totalMs: number): void;
  /** Draw the current time again even though it did not change (first draw, canvas replaced). */
  redraw(): void;
}

/** A long gap between frames (a hiccup, a throttled tab) must not make the poem jump ahead. */
export const MAX_FRAME_DELTA_MS = 100;

export function createPlayer({ totalMs: initialTotalMs, draw = () => {}, scheduler, initialT = 0, loop = false }: PlayerOptions): Player {
  let drawFn = draw;
  let totalMs = initialTotalMs;
  const clamp = (t: number) => (Number.isFinite(t) ? Math.min(totalMs, Math.max(0, t)) : 0);

  let state: PlayerState = { t: clamp(initialT), playing: false, loop };
  let lastDrawn = Number.NaN;
  let lastFrameTime: number | null = null;
  let handle: number | null = null;
  const listeners = new Set<() => void>();

  const emit = () => listeners.forEach((listener) => listener());
  const set = (next: Partial<PlayerState>) => {
    state = { ...state, ...next };
    emit();
  };
  const drawIfChanged = () => {
    if (state.t === lastDrawn) return;
    lastDrawn = state.t;
    drawFn(state.t);
  };
  const stopFrames = () => {
    if (handle !== null) scheduler.cancel(handle);
    handle = null;
    lastFrameTime = null;
  };
  const scheduleFrame = () => {
    handle = scheduler.request(tick);
  };

  function tick(now: number) {
    handle = null;
    if (!state.playing) return;
    const delta = lastFrameTime === null ? 0 : Math.min(now - lastFrameTime, MAX_FRAME_DELTA_MS);
    lastFrameTime = now;

    let t = state.t + delta;
    let playing = true;
    if (t >= totalMs) {
      if (state.loop && totalMs > 0) t = t - totalMs;
      else {
        t = totalMs;
        playing = false;
      }
    }
    state = { ...state, t, playing };
    drawIfChanged();
    emit();
    if (playing) scheduleFrame();
    else lastFrameTime = null;
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    play() {
      if (state.playing) return;
      // Pressing play on a finished poem plays it again from the start.
      const t = state.t >= totalMs ? 0 : state.t;
      lastFrameTime = null;
      set({ t, playing: true });
      drawIfChanged();
      scheduleFrame();
    },
    pause() {
      if (!state.playing) return;
      stopFrames();
      set({ playing: false });
    },
    toggle() {
      if (state.playing) this.pause();
      else this.play();
    },
    restart() {
      stopFrames();
      state = { ...state, t: 0, playing: false };
      this.play();
    },
    seek(t) {
      set({ t: clamp(t) });
      drawIfChanged();
    },
    setLoop(next) {
      set({ loop: next });
    },
    setDraw(next) {
      drawFn = next;
    },
    setTotal(next) {
      const fraction = totalMs > 0 ? state.t / totalMs : 0;
      totalMs = Math.max(0, Number.isFinite(next) ? next : 0);
      state = { ...state, t: clamp(fraction * totalMs) };
      lastDrawn = Number.NaN; // the poster may look different even at the same time: draw again
      emit();
    },
    redraw() {
      lastDrawn = Number.NaN;
      drawIfChanged();
    },
  };
}
