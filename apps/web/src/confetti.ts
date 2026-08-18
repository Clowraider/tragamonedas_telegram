export type ConfettiIntensity = "soft" | "grand";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  rotationSpeed: number;
  opacity: number;
  isStar?: boolean;
}

const SOFT_COLORS = ["#fbbf24", "#10b981", "#ec4899", "#38bdf8", "#f43f5e"];
const GRAND_COLORS = [
  "#fbbf24",
  "#f59e0b",
  "#fef08a",
  "#fff",
  "#ec4899",
  "#38bdf8",
  "#10b981",
];

class ConfettiEngine {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private particles: Particle[] = [];
  private animationFrameId: number | null = null;

  public init(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.resize();
    window.addEventListener("resize", this.handleResize);
  }

  public destroy(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    window.removeEventListener("resize", this.handleResize);
    this.canvas = null;
    this.ctx = null;
    this.particles = [];
  }

  private handleResize = (): void => {
    this.resize();
  };

  private resize(): void {
    if (!this.canvas) return;
    const rect = this.canvas.parentElement?.getBoundingClientRect();
    if (rect) {
      this.canvas.width = rect.width;
      this.canvas.height = rect.height;
    } else {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
    }
  }

  public fire(intensity: ConfettiIntensity): void {
    if (!this.canvas || !this.ctx) return;
    this.resize();

    const w = this.canvas.width;
    const h = this.canvas.height;

    if (intensity === "soft") {
      // 30 gentle particles bursting from the center of the slot reels
      const originX = w / 2;
      const originY = h * 0.45;
      const count = 32;

      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
        const speed = 3 + Math.random() * 4;
        this.particles.push({
          x: originX,
          y: originY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 2.5,
          size: 5 + Math.random() * 4,
          color: SOFT_COLORS[Math.floor(Math.random() * SOFT_COLORS.length)] ?? "#fbbf24",
          rotation: Math.random() * Math.PI * 2,
          rotationSpeed: (Math.random() - 0.5) * 0.15,
          opacity: 1,
        });
      }
    } else {
      // 90 grand jackpot particles from both bottom-left and bottom-right corners
      const count = 80;
      for (let i = 0; i < count; i++) {
        const fromLeft = i % 2 === 0;
        const originX = fromLeft ? w * 0.15 : w * 0.85;
        const originY = h * 0.75;
        const baseAngle = fromLeft ? -Math.PI / 3 : (-2 * Math.PI) / 3;
        const angle = baseAngle + (Math.random() - 0.5) * 0.6;
        const speed = 7 + Math.random() * 7;

        this.particles.push({
          x: originX,
          y: originY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: 6 + Math.random() * 6,
          color: GRAND_COLORS[Math.floor(Math.random() * GRAND_COLORS.length)] ?? "#fbbf24",
          rotation: Math.random() * Math.PI * 2,
          rotationSpeed: (Math.random() - 0.5) * 0.25,
          opacity: 1,
          isStar: Math.random() > 0.6,
        });
      }
    }

    if (this.animationFrameId === null) {
      this.loop();
    }
  }

  private loop = (): void => {
    if (!this.ctx || !this.canvas) return;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.18; // gravity
      p.vx *= 0.985; // air friction
      p.rotation += p.rotationSpeed;
      p.opacity -= 0.008; // fade out

      if (p.opacity <= 0 || p.y > this.canvas.height + 20) {
        this.particles.splice(i, 1);
        continue;
      }

      this.ctx.save();
      this.ctx.translate(p.x, p.y);
      this.ctx.rotate(p.rotation);
      this.ctx.globalAlpha = Math.max(0, p.opacity);
      this.ctx.fillStyle = p.color;

      if (p.isStar) {
        this.ctx.font = `${p.size * 1.5}px sans-serif`;
        this.ctx.fillText("★", -p.size / 2, p.size / 2);
      } else {
        this.ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      }

      this.ctx.restore();
    }

    if (this.particles.length > 0) {
      this.animationFrameId = requestAnimationFrame(this.loop);
    } else {
      this.animationFrameId = null;
    }
  };
}

export const confettiEngine = new ConfettiEngine();
