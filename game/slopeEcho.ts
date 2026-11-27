/**
 * What is heard in a cave (asked, of a great dungeon: "Sound, lighting and art direction. Darkness, echoing drips and a change in music
 * before a big fight set the mood"; then "proceed autonomously to make these all dungeon improvements"): the wind at its mouth, fading
 * as one goes in; water dripping in the dark, each drop ringing off the stone and coming back; now and then something far off, low; and
 * a low drone under it all as one comes into the room of whoever the place was made for, that swells while their great one is up.
 * Made as it is wanted, of noise and tones (no files), quietly, and only once woken from a click, as the arms' sound is (`GunSound`):
 * the game is otherwise silent, and keeps to that.
 */
import { Rng } from '../src/core/rng';

export class CaveEcho {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private wet: GainNode | null = null;
  private wind: GainNode | null = null;
  private drone: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private readonly rng = new Rng('cave echo');
  private nextDrip = 1;
  private nextFar = 15;

  /** Woken from a click (a browser lets a page make sound only after one). */
  wake(): void {
    try {
      if (!this.ctx) {
        const c = (this.ctx = new AudioContext());
        this.out = c.createGain();
        this.out.gain.value = 0.3;
        this.out.connect(c.destination);
        // (The stone's echo: a delay fed back into itself, darkened each time round.)
        const delay = c.createDelay(1), back = c.createGain(), dark = c.createBiquadFilter();
        delay.delayTime.value = 0.23; back.gain.value = 0.42; dark.type = 'lowpass'; dark.frequency.value = 2200;
        this.wet = c.createGain();
        this.wet.gain.value = 0.5;
        this.wet.connect(delay).connect(dark).connect(back).connect(delay);
        dark.connect(this.out);
        const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = this.rng.range(-1, 1);
        this.noise = buf;
        // (The wind: noise, low and moving, always going, heard only as loud as the mouth is near.)
        const src = c.createBufferSource(), band = c.createBiquadFilter(), sway = c.createOscillator(), swayBy = c.createGain();
        src.buffer = buf; src.loop = true;
        band.type = 'bandpass'; band.frequency.value = 380; band.Q.value = 0.7;
        sway.frequency.value = 0.13; swayBy.gain.value = 160;
        sway.connect(swayBy).connect(band.frequency);
        this.wind = c.createGain();
        this.wind.gain.value = 0;
        src.connect(band).connect(this.wind).connect(this.out);
        src.start(); sway.start();
        // (The drone: two low tones a little apart, beating, under a soft fifth.)
        this.drone = c.createGain();
        this.drone.gain.value = 0;
        for (const [f, g] of [[55, 0.5], [55.7, 0.5], [82.4, 0.25]] as const) {
          const o = c.createOscillator(), og = c.createGain();
          o.type = 'triangle'; o.frequency.value = f; og.gain.value = g;
          o.connect(og).connect(this.drone);
          o.start();
        }
        const soft = c.createBiquadFilter();
        soft.type = 'lowpass'; soft.frequency.value = 300;
        this.drone.connect(soft).connect(this.out);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch { /* (no sound where there is none to be had) */ }
  }

  /**
   * A moment on: `inside`, how far into the dark one is (0 out on the snow, 1 deep in); `mouth`, how near the cave's mouth (1 at it);
   * `dread`, 0 to 1, how near the great one's fight is (its room come into, or it up). Silent until woken, and while not in a cave.
   */
  step(dt: number, inside: number, mouth: number, dread: number): void {
    const c = this.ctx;
    if (!c || c.state !== 'running' || !this.wind || !this.drone || !this.wet || !this.noise) return;
    const t = c.currentTime;
    this.wind.gain.setTargetAtTime(0.16 * mouth * (0.4 + 0.6 * Math.min(1, inside * 3)), t, 0.5);
    this.drone.gain.setTargetAtTime(0.22 * dread, t, 1.2);
    if (inside < 0.3) return;
    // (Drips, every few seconds, some quick after one another, as water gathers and falls.)
    this.nextDrip -= dt;
    if (this.nextDrip <= 0) {
      this.nextDrip = this.rng.chance(0.25) ? this.rng.range(0.25, 0.6) : this.rng.range(1.8, 5.5);
      const o = c.createOscillator(), g = c.createGain(), f = this.rng.range(900, 2100), at = t + 0.01;
      o.type = 'sine';
      o.frequency.setValueAtTime(f * 1.6, at); o.frequency.exponentialRampToValueAtTime(f, at + 0.05);
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.09 * inside, at + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
      o.connect(g); g.connect(this.out!); g.connect(this.wet);
      o.start(at); o.stop(at + 0.2);
    }
    // (Something far off: a low growl through the stone, or stone settling; rarely.)
    this.nextFar -= dt;
    if (this.nextFar <= 0) {
      this.nextFar = this.rng.range(25, 60);
      const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), at = t + 0.01, len = this.rng.range(1.2, 2.4);
      src.buffer = this.noise; src.playbackRate.value = 0.3;
      f.type = 'lowpass'; f.frequency.setValueAtTime(this.rng.range(120, 220), at);
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.25 * inside, at + len * 0.4); g.gain.exponentialRampToValueAtTime(0.0001, at + len);
      src.connect(f).connect(g); g.connect(this.out!); g.connect(this.wet);
      src.start(at); src.stop(at + len + 0.05);
    }
  }
}
