// AudioManager — thin wrapper around Phaser's global sound manager.
// Uses game.registry to track the current BGM key so any scene can call
// playMusic without restarting a track that's already playing.
//
// Tracks listed in INTRO_LOOP_TRACKS play an intro clip once, then seamlessly
// chain into a separate looping clip — avoiding all Web Audio loopStart/loopEnd
// complexity that Phaser doesn't expose reliably.

import BadgeSystem from './BadgeSystem.js';

const MUSIC_VOL = 0.6;
const FADE_MS   = 700;

// Keys that use a split intro + loop file pair.
// AudioManager maps the logical key → { intro, loop } cache keys.
const INTRO_LOOP_TRACKS = {
  'music-neighborhood': {
    intro: 'music-neighborhood-intro',
    loop:  'music-neighborhood-loop',
  },
};

export default class AudioManager {
  // A volume tween whose sound gets stopped or destroyed underneath it will
  // write to a null target on its next step, and that exception is thrown from
  // inside TweenManager.update — which kills the entire game loop, freezing the
  // whole game. So the current fade is tracked here and cancelled before any
  // code stops or destroys the sound it is animating. The tween is kept as an
  // object (not looked up per-scene) because the scene that created it is often
  // not the scene that later tears the sound down.
  static _killFade(reg) {
    const t = reg.get('bgm-fade');
    if (t) { try { t.remove(); } catch (e) { /* already gone */ } }
    reg.set('bgm-fade', null);
  }

  static _fade(scene, reg, sound, toVol, onDone) {
    AudioManager._killFade(reg);
    const t = scene.tweens.add({
      targets: sound, volume: toVol, duration: FADE_MS,
      onComplete: () => { reg.set('bgm-fade', null); onDone?.(); },
    });
    reg.set('bgm-fade', t);
    return t;
  }

  // Start a looping music track. No-ops if that key is already playing.
  static playMusic(scene, key, volume = MUSIC_VOL) {
    const reg = scene.game.registry;
    if (reg.get('bgm-key') === key) return;

    const old = reg.get('bgm-sound');
    AudioManager._killFade(reg);       // must precede stop() — see _killFade
    if (old?.isPlaying) old.stop();

    reg.set('bgm-key', key);
    reg.set('bgm-sound', null);

    const split = INTRO_LOOP_TRACKS[key];

    const _start = () => {
      if (reg.get('bgm-key') !== key) return;
      const targetVol = reg.get('audio-music') !== false ? volume : 0;

      if (split) {
        // Play intro once, then hand off to the loop clip.
        const intro = scene.sound.add(split.intro, { loop: false, volume: 0 });
        if (targetVol > 0) AudioManager._fade(scene, reg, intro, targetVol);
        intro.play();
        reg.set('bgm-sound', intro);

        intro.once('complete', () => {
          // Cancel the fade-in first: if the scene was paused part-way through
          // it (dialogue does exactly that) the tween is still live, and
          // destroying its target below would crash the game loop.
          AudioManager._killFade(reg);
          if (reg.get('bgm-key') !== key) return;
          intro.destroy();
          const loopVol = reg.get('audio-music') !== false ? volume : 0;
          const loop = scene.sound.add(split.loop, { loop: true, volume: loopVol });
          loop.play();
          reg.set('bgm-sound', loop);
        });
      } else {
        const snd = scene.sound.add(key, { loop: true, volume: 0 });
        snd.play();
        if (targetVol > 0) AudioManager._fade(scene, reg, snd, targetVol);
        reg.set('bgm-sound', snd);
      }
    };

    if (scene.sound.locked) {
      scene.sound.once('unlocked', _start);
    } else {
      _start();
    }
  }

  // Fade out and stop whatever is currently playing.
  static stopMusic(scene) {
    const reg = scene.game.registry;
    const old = reg.get('bgm-sound');
    AudioManager._killFade(reg);
    reg.set('bgm-key', null);

    if (!old?.isPlaying) { reg.set('bgm-sound', null); return; }

    // Deliberately leave 'bgm-sound' pointing at `old` until the fade finishes.
    // If playMusic runs first it will kill this fade and stop the sound itself;
    // clearing the reference early would strand it playing forever.
    AudioManager._fade(scene, reg, old, 0, () => {
      try { old.stop(); } catch (e) { /* already torn down */ }
      if (reg.get('bgm-sound') === old) reg.set('bgm-sound', null);
    });
  }

  // Mute or unmute the currently playing BGM.
  static setMusicEnabled(scene, enabled) {
    const reg = scene.game.registry;
    const snd = reg.get('bgm-sound');
    if (!snd) return;
    snd.setVolume(enabled ? MUSIC_VOL : 0);
  }

  // Play a random fart sound — but only from the sounds the player has UNLOCKED
  // via badges (Phase R). Auto-discovers every sfx-fart-N clip that actually loaded
  // (cached on first use). Falls back to all loaded farts if the unlock list is
  // empty or unavailable, so a bug can never silence farts.
  static playFart(scene) {
    if (!scene.game.registry.get('audio-sfx')) return;
    if (!AudioManager._fartKeys) {
      AudioManager._fartKeys = [];
      for (let n = 1; n <= 64; n++) {
        const key = `sfx-fart-${n}`;
        if (scene.cache.audio.exists(key)) AudioManager._fartKeys.push(key);
      }
    }
    const all = AudioManager._fartKeys;
    if (all.length === 0) return;

    let pool = all;
    try {
      const unlocked = BadgeSystem.unlockedFarts();       // fart indices, e.g. [1,2,3,...]
      const filtered = all.filter(k => unlocked.includes(Number(k.split('-').pop())));
      if (filtered.length > 0) pool = filtered;
    } catch (e) { /* fall back to all farts */ }

    scene.sound.play(pool[Math.floor(Math.random() * pool.length)], { volume: 0.85 });
  }

  // Play a random deer grunt (sfx-deer-grunt-1 through sfx-deer-grunt-4).
  static playDeerGrunt(scene) {
    if (!scene.game.registry.get('audio-sfx')) return;
    const n = Phaser.Math.Between(1, 4);
    const key = `sfx-deer-grunt-${n}`;
    if (scene.cache.audio.exists(key)) scene.sound.play(key, { volume: 0.7 });
  }

  // Fire-and-forget sound effect.
  static playSfx(scene, key, config = {}) {
    if (!scene.game.registry.get('audio-sfx')) return;
    if (scene.cache.audio.exists(key)) {
      scene.sound.play(key, { volume: 0.75, ...config });
    }
  }
}
