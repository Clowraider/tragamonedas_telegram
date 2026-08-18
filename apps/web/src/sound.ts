export type SoundEffect =
  | "lever"
  | "reel_stop"
  | "win_small"
  | "win_jackpot"
  | "clik"
  | "multi_spin";

const SOUND_FILES: Record<SoundEffect, string> = {
  lever: "/sound/lever.wav",
  reel_stop: "/sound/reel_stop.wav",
  win_small: "/sound/win_small.wav",
  win_jackpot: "/sound/win_jackpot.wav",
  clik: "/sound/clik.wav",
  multi_spin: "/sound/multi_spin.wav",
};

class SoundManager {
  private isMuted: boolean = false;
  private audioCache: Map<string, HTMLAudioElement> = new Map();

  constructor() {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("slot_sound_muted");
      if (saved !== null) {
        this.isMuted = saved === "true";
      }
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (typeof window !== "undefined") {
      localStorage.setItem("slot_sound_muted", String(muted));
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  public play(effect: SoundEffect): void {
    if (this.isMuted || typeof window === "undefined" || typeof Audio === "undefined") {
      return;
    }

    try {
      const url = SOUND_FILES[effect];
      if (!url) return;

      // Create or clone audio instance to allow overlapping playback (e.g. rapid reel stops)
      const audio = new Audio(url);
      audio.currentTime = 0;
      audio.play().catch(() => {
        // Autoplay policy or browser restriction fallback
      });
    } catch {
      // Audio execution safe fallback
    }
  }
}

export const soundManager = new SoundManager();

export function playSound(effect: SoundEffect): void {
  soundManager.play(effect);
}
