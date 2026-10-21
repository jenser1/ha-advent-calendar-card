import { prefersReducedMotion } from './themes';

export const SNOW_TAG = 'advent-calendar-snow';

interface Flake {
  x: number;
  y: number;
  radius: number;
  speed: number;
  drift: number;
  phase: number;
}

// Etwa eine Flocke pro 7000 px², höchstens 90 – bleibt auch auf älteren Tablets flüssig.
const AREA_PER_FLAKE = 7000;
const MAX_FLAKES = 90;

/**
 * Leichtgewichtiger Schneefall als Canvas hinter den Türchen. Läuft nur, solange
 * die Karte sichtbar ist und der Tab im Vordergrund liegt; bei „Bewegung reduzieren“ gar nicht.
 * Die Farbe kommt aus --advent-snow des Themes.
 */
export class AdventCalendarSnow extends HTMLElement {
  private canvas?: HTMLCanvasElement;
  private context?: CanvasRenderingContext2D | null;
  private flakes: Flake[] = [];
  private frame?: number;
  private lastTime = 0;
  private color = 'rgba(255, 255, 255, 0.85)';
  private colorTime = -Infinity;
  private inView = true;
  private resizeObserver?: ResizeObserver;
  private intersectionObserver?: IntersectionObserver;

  connectedCallback(): void {
    if (!this.shadowRoot) {
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML = `
        <style>
          :host { position: absolute; inset: 0; pointer-events: none; z-index: 0; }
          canvas { display: block; width: 100%; height: 100%; }
        </style>
        <canvas></canvas>`;
      this.canvas = root.querySelector('canvas')!;
    }
    if (prefersReducedMotion()) {
      return;
    }
    this.context = this.canvas?.getContext('2d');
    if (!this.context) {
      return;
    }
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this);
    }
    if (typeof IntersectionObserver !== 'undefined') {
      this.intersectionObserver = new IntersectionObserver(([entry]) => {
        this.inView = entry.isIntersecting;
        this.updateRunning();
      });
      this.intersectionObserver.observe(this);
    }
    document.addEventListener('visibilitychange', this.updateRunning);
    this.resize();
    this.updateRunning();
  }

  disconnectedCallback(): void {
    this.stop();
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();
    document.removeEventListener('visibilitychange', this.updateRunning);
  }

  private resize(): void {
    const canvas = this.canvas;
    if (!canvas || !this.context) {
      return;
    }
    const { width, height } = this.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);

    const count = Math.min(MAX_FLAKES, Math.round((width * height) / AREA_PER_FLAKE));
    this.flakes = Array.from({ length: count }, () => this.createFlake(width, height, true));
  }

  private createFlake(width: number, height: number, anywhere: boolean): Flake {
    return {
      x: Math.random() * width,
      y: anywhere ? Math.random() * height : -5,
      radius: 1 + Math.random() * 2.2,
      speed: 18 + Math.random() * 30,
      drift: 8 + Math.random() * 14,
      phase: Math.random() * Math.PI * 2,
    };
  }

  private updateRunning = (): void => {
    if (this.inView && document.visibilityState !== 'hidden') {
      this.start();
    } else {
      this.stop();
    }
  };

  private start(): void {
    if (this.frame === undefined && this.context) {
      this.lastTime = performance.now();
      this.frame = requestAnimationFrame(this.tick);
    }
  }

  private stop(): void {
    if (this.frame !== undefined) {
      cancelAnimationFrame(this.frame);
      this.frame = undefined;
    }
  }

  private tick = (time: number): void => {
    const context = this.context;
    if (!context) {
      return;
    }
    // Nach einer Pause (Tab im Hintergrund) nicht springen.
    const seconds = Math.min((time - this.lastTime) / 1000, 0.1);
    this.lastTime = time;
    const width = this.clientWidth;
    const height = this.clientHeight;

    // Farbe etwa einmal pro Sekunde neu lesen (z. B. nach Wechsel hell/dunkel), nicht in jedem Frame.
    if (time - this.colorTime > 1000) {
      this.color =
        getComputedStyle(this).getPropertyValue('--advent-snow').trim() || 'rgba(255, 255, 255, 0.85)';
      this.colorTime = time;
    }

    context.clearRect(0, 0, width, height);
    context.fillStyle = this.color;
    context.beginPath();
    for (let i = 0; i < this.flakes.length; i++) {
      const flake = this.flakes[i];
      flake.phase += seconds;
      flake.y += flake.speed * seconds;
      flake.x = (flake.x + Math.sin(flake.phase) * flake.drift * seconds + width) % width;
      if (flake.y - flake.radius > height) {
        this.flakes[i] = this.createFlake(width, height, false);
        continue;
      }
      context.moveTo(flake.x + flake.radius, flake.y);
      context.arc(flake.x, flake.y, flake.radius, 0, Math.PI * 2);
    }
    context.fill();
    this.frame = requestAnimationFrame(this.tick);
  };
}

if (!customElements.get(SNOW_TAG)) {
  customElements.define(SNOW_TAG, AdventCalendarSnow);
}

declare global {
  interface HTMLElementTagNameMap {
    'advent-calendar-snow': AdventCalendarSnow;
  }
}
