import Phaser from 'phaser';

// ArcadeAudio — the Donut Rain soundscape.
//
// Two sources, one interface:
//   • Sampled SFX + music reused from the adventure (farts, hits, deer, boss/level
//     loops) played through Phaser's sound manager.
//   • Tiny WebAudio-synth blips for the frequent, feel-critical bits (each catch,
//     golden chime, meter-ready, game-over) — crisp chiptune tones that need no
//     assets and can pitch-climb with the combo.
//
// Everything is guarded: a missing audio key or a suspended context is a no-op,
// never a throw. Music waits for Phaser's input-unlock before starting.

export default class ArcadeAudio {
  constructor(scene) {
    this.scene = scene;
    this.muted = false;
    this._music = null;
    // Phaser's WebAudio context (null under the HTML5-audio fallback).
    this.ctx = scene.sound && scene.sound.context ? scene.sound.context : null;
  }

  // ── Music ─────────────────────────────────────────────────────────────────
  startMusic(key, volume = 0.3) {
    const go = () => this.playMusic(key, volume);
    if (this.scene.sound.locked) this.scene.sound.once('unlocked', go);
    else go();
  }

  playMusic(key, volume = 0.3) {
    this.stopMusic();
    if (!this.scene.cache.audio.exists(key)) return;
    this._music = this.scene.sound.add(key, { loop: true, volume });
    this._music.setMute(this.muted);
    this._music.play();
  }

  stopMusic() {
    if (this._music) { this._music.stop(); this._music.destroy(); this._music = null; }
  }

  // ── Sampled SFX ───────────────────────────────────────────────────────────
  _play(key, opts) {
    if (!this.muted && this.scene.cache.audio.exists(key)) this.scene.sound.play(key, opts);
  }
  hit()        { this._play('sfx-bike-hit', { volume: 0.6 }); }
  deer()       { this._play(`sfx-deer-grunt-${Phaser.Math.Between(1, 4)}`, { volume: 0.55 }); }
  frenzy()     { this._play(`sfx-fart-${Phaser.Math.Between(1, 6)}`, { volume: 0.7 }); }
  bossVoice(k) { if (k) this._play(k, { volume: 0.6 }); }

  // ── Synth blips ───────────────────────────────────────────────────────────
  _tone(freq, dur, type = 'square', vol = 0.16, slideTo = null, delay = 0) {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // Catch pop — pitch climbs with the combo for a satisfying rising streak.
  catch(combo = 0) {
    const base = 520 + Math.min(combo, 14) * 26;
    this._tone(base, 0.08, 'square', 0.15, base * 1.5);
  }
  golden()   { [660, 880, 1320].forEach((f, i) => this._tone(f, 0.12, 'triangle', 0.17, null, i * 0.06)); }
  ready()    { [523, 784].forEach((f, i) => this._tone(f, 0.14, 'triangle', 0.2, null, i * 0.09)); }
  // Recruited a friend — a bright 4-note fanfare so it clearly reads as special.
  friendCatch() { [523, 659, 784, 1047].forEach((f, i) => this._tone(f, 0.13, 'square', 0.18, null, i * 0.07)); }
  gameOver() { [523, 415, 311, 233].forEach((f, i) => this._tone(f, 0.24, 'sawtooth', 0.18, null, i * 0.16)); }

  // ── Mute ──────────────────────────────────────────────────────────────────
  setMuted(m) {
    this.muted = m;
    if (this._music) this._music.setMute(m);
    return this.muted;
  }
  toggle() { return this.setMuted(!this.muted); }
}
