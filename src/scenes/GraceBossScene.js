import {
  SCENE_GRACE_BOSS, SCENE_DIALOGUE, SCENE_NEIGHBORHOOD, SCENE_BOSS_GAUNTLET,
  SCENE_HUD, BASE_WIDTH, BASE_HEIGHT, TILE_SIZE, SPRITE_LEO, txt, MUSIC_BOSS,
} from '../constants.js';
import AudioManager from '../systems/AudioManager.js';
import FX from '../systems/FX.js';
import { registerCharacterAnims } from '../utils/AnimationRegistry.js';
import ResourceSystem from '../systems/ResourceSystem.js';
import AbilitySystem from '../systems/AbilitySystem.js';
import PartySystem from '../systems/PartySystem.js';
import FartGauge from '../ui/FartGauge.js';

// ─── Grace Boss Scene ────────────────────────────────────────────────────────
// Isolated pool-arena battle. Leo faces Grace in her backyard.
//
// Arena layout (world = 480×270):
//   - Concrete deck (gray) fills most of the arena
//   - Swimming pool (blue rect) is a hazard in the center
//   - Leo starts at the bottom; Grace starts at the top
//
// Grace attack cycle:
//   PATROL  → walks back and forth at top
//   CHASE   → moves toward Leo
//   THROW   → launches a pool noodle projectile every ~3s
//   SQUIRT  → fires fast water shots every ~1.5s when in range
//   STUNNED → brief recovery after taking a fart hit
//   DEFEATED → spin + fade, scene ends
//
// Leo input: WASD to move, F to fart (shockwave)
// 3 fart hits defeat Grace. Pool touch drains energy fast.

const T = TILE_SIZE;

// Arena geometry (in pixels)
const ARENA_W   = BASE_WIDTH;
const ARENA_H   = BASE_HEIGHT;

// Pool (hazard rectangle) — matches grace_pool.png (1536×1024 → 480×270)
// Scanned blue pixel bounds: x=292–1371, y=374–818 in source image
const POOL_X    = 260;
const POOL_Y    = 158;
const POOL_W    = 337;
const POOL_H    = 117;

// Deck bounds — restricts Leo to the paved pool deck (keeps him out of bushes/fence)
const DECK_LEFT   = 38;
const DECK_RIGHT  = 442;
const DECK_TOP    = 50;
const DECK_BOTTOM = 252;

// Squirts travel a random 70–150px before landing as a deck puddle
const SQUIRT_MIN_RANGE = 70;
const SQUIRT_MAX_RANGE = 150;

// Grace constants
const GRACE_MAX_HP    = 3;
const PATROL_SPEED    = 70;
const CHASE_SPEED     = 115;
const CHASE_SPEED_WATER = CHASE_SPEED * 0.5; // Grace wades slower through the pool
const CHASE_RANGE     = 140;
const STUN_DURATION   = 1200; // ms
const FART_HIT_RANGE  = 80;   // px shockwave radius

// Leo movement
const LEO_SPEED       = 170;

// Projectile speeds
const NOODLE_SPEED    = 90;
const SQUIRT_SPEED    = 160;

// Damage amounts — all multiples of 20 so each hit = exactly 1 heart (5 hearts total)
const NOODLE_DAMAGE   = 20;   // 1 heart
const SQUIRT_DAMAGE   = 20;   // 1 heart
const PUDDLE_DAMAGE   = 20;   // 1 heart
const CONTACT_DAMAGE  = 20;   // 1 heart — like her other hits. Was 40 (2 hearts), which
                              // made the FIRST boss deadlier than every later one (12-18)
                              // and could end the fight in ~3 touches. Still avoid contact.

const POOL_STUN_MS    = 1500; // ms Leo is stunned after falling in the pool
const POOL_PUSH_DIST  = 40;   // px pushed away from pool edge on entry

const CONTACT_COOLDOWN = 1500; // ms

// Global mercy invulnerability: after ANY hit, Leo can't be hurt again for this
// long — by any source. Each hazard already has its own cooldown, but those are
// independent, so a contact + puddle + squirt + noodle could all land in one
// instant for 80 damage (4 hearts) with no reaction time. This caps it to one
// heart per window and is the main reason Grace felt brutally hard.
const DAMAGE_IFRAME = 800; // ms

export default class GraceBossScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_GRACE_BOSS });
  }

  init(data) {
    this._gauntlet = data?.gauntlet ?? false;
    this._gauntletData = data?.gauntletData ?? {};
  }

  create() {
    try {
      this._createImpl();
    } catch (err) {
      console.error('[GraceBossScene] create() threw:', err);
      this.add.text(10, 10, 'GRACE SCENE ERROR:\n' + err.message, {
        fontFamily: 'monospace', fontSize: '10px', color: '#ff4444',
        wordWrap: { width: 460 },
      });
    }
  }

  _createImpl() {
    AudioManager.playMusic(this, MUSIC_BOSS);
    // Reuse systems from registry (set up by NeighborhoodScene)
    this._resources = this.game.registry.get('resources');
    this._party     = this.game.registry.get('party');
    this._abilities = this.game.registry.get('abilities');

    // If systems somehow aren't set up, create fresh ones
    if (!this._resources) {
      this._resources = new ResourceSystem(this.game);
      this._party     = new PartySystem(this.game);
      this._abilities = new AbilitySystem(this.game, this._party);
    }

    // Standalone (Act 1) boss fights start fresh at full energy. In the Act 3 gauntlet,
    // energy PERSISTS across bosses (set full once when the gauntlet begins) so that
    // spending a donut to recharge between fights actually matters.
    if (!this._gauntlet) this._resources.applyChanges({ energy: 100 - this._resources.energy });

    // Hide the neighborhood HUD — boss scene draws its own hearts
    this.scene.sleep(SCENE_HUD);

    this._abilities.register('lightning_fart', (scene, player) => {
      AudioManager.playFart(scene);
      const ring = scene.add.circle(player.x, player.y, 6, 0xf5e642, 0.9);
      scene.tweens.add({ targets: ring, radius: FART_HIT_RANGE, alpha: 0, duration: 400,
        onComplete: () => ring.destroy() });
    });

    this._graceHp      = GRACE_MAX_HP;
    this._graceState   = 'PATROL';
    this._graceX       = ARENA_W / 2;
    this._graceY       = 60;
    this._graceVx      = PATROL_SPEED;
    this._lastContact  = 0;
    this._lastDamage   = 0;   // global mercy-invuln timestamp (see _damagePlayer)
    this._leoStunned   = false;
    this._fartReady    = true;
    this._fartCooldownMs = 4000;
    this._projectiles  = [];
    this._defeated     = false;
    this._inputLocked  = true;  // locked during intro cutscene

    this._leoX = ARENA_W / 2;
    this._leoY = ARENA_H - 50;

    // ── Jump state ────────────────────────────────────────────────────────────
    this._isJumping      = false;
    this._jumpElapsed    = 0;
    this._jumpDuration   = 420;   // ms
    this._jumpOffsetY    = 0;     // visual lift (negative = up)
    this._jumpCooldownEnd = 0;
    this._deckHitCooldown = 0;
    this._puddles         = [];

    // Lawn chairs — solid, cannot be jumped over (upper-left corner)
    this._chairs = [
      { x:  81, y: 66, w: 46, h: 26 },
      { x: 120, y: 63, w: 40, h: 24 },
    ];

    this._buildArena();
    this._buildGrace();
    this._buildLeo();
    this._buildHud();
    this._setupInput();
    this._setupAttackTimers();
    this._runIntroCutscene();
  }

  // ─── Arena ──────────────────────────────────────────────────────────────────

  _buildArena() {
    // Background image — replaces all primitive deck/pool/noodle visuals
    if (this.textures.exists('bg-grace')) {
      this.add.image(0, 0, 'bg-grace').setOrigin(0, 0).setDisplaySize(ARENA_W, ARENA_H).setDepth(0);
    } else {
      // Fallback if image didn't load
      this.add.rectangle(ARENA_W / 2, ARENA_H / 2, ARENA_W, ARENA_H, 0x888899);
      this.add.rectangle(POOL_X, POOL_Y, POOL_W + 10, POOL_H + 10, 0xaaaacc);
      this.add.rectangle(POOL_X, POOL_Y, POOL_W, POOL_H, 0x1a6eb4);
    }
    // Pool collision zone is purely logical — POOL_X/Y/W/H constants drive push-out and drain
  }

  // ─── Grace visual ───────────────────────────────────────────────────────────

  _buildGrace() {
    if (this.textures.exists('sprite-grace-char')) {
      this._graceBody = this.add.image(this._graceX, this._graceY, 'sprite-grace-char')
        .setDisplaySize(40, 60).setDepth(5);
    } else {
      this._graceBody = this.add.rectangle(this._graceX, this._graceY, T * 2.5, T * 3, 0xff6eb4).setDepth(5);
    }


    this._graceHpBg   = this.add.rectangle(ARENA_W / 2, 16, 160, 8, 0x440000).setScrollFactor(0).setDepth(20);
    this._graceHpFill = this.add.rectangle(ARENA_W / 2 - 78, 16, 156, 6, 0xff2222)
      .setScrollFactor(0).setDepth(21).setOrigin(0, 0.5);
    txt(this, ARENA_W / 2, 6, 'GRACE', { fontSize: '8px', color: '#ff88cc' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(21);

    this._alertLabel = txt(this, this._graceX, this._graceY - 30, '!', {
      fontSize: '8px', color: '#ffff00',
    }).setOrigin(0.5).setDepth(6).setVisible(false);
  }

  // ─── Leo visual ─────────────────────────────────────────────────────────────

  _buildLeo() {
    this._leoShadow = this.add.ellipse(this._leoX, this._leoY + 10, 22, 7, 0x000000, 0.28).setDepth(4);

    if (this.textures.exists(SPRITE_LEO)) {
      registerCharacterAnims(this.anims, SPRITE_LEO);
      this._leoSprite = this.add.sprite(this._leoX, this._leoY, SPRITE_LEO, 'down-0')
        .setDisplaySize(T * 3, T * 3).setDepth(5);
      this._leoBody = null;
      this._leoDot  = null;
    } else {
      this._leoSprite = null;
      this._leoBody = this.add.rectangle(this._leoX, this._leoY, T * 2, T * 2.5, 0x4488ff).setDepth(5);
      this._leoDot  = this.add.rectangle(this._leoX, this._leoY - 12, 6, 4, 0xffffff).setDepth(5);
    }
    this._leoFacing = 'down';
  }

  _moveLeoVisual(vx, vy) {
    const visualY = this._leoY + this._jumpOffsetY;
    this._leoShadow.setPosition(this._leoX, this._leoY + 10); // shadow always at ground

    if (this._leoSprite) {
      this._leoSprite.setPosition(this._leoX, visualY);
      if (Math.abs(vx) >= Math.abs(vy)) { if (vx > 0) this._leoFacing = 'right'; else if (vx < 0) this._leoFacing = 'left'; }
      else                              { if (vy > 0) this._leoFacing = 'down';  else if (vy < 0) this._leoFacing = 'up'; }
      const moving  = vx !== 0 || vy !== 0;
      const animKey = moving ? `${SPRITE_LEO}-walk-${this._leoFacing}` : `${SPRITE_LEO}-idle-${this._leoFacing}`;
      if (this._leoSprite.anims?.currentAnim?.key !== animKey) this._leoSprite.play(animKey);
    } else {
      this._leoBody.setPosition(this._leoX, visualY);
      this._leoDot.setPosition(this._leoX, visualY - 12);
    }
  }

  // ─── HUD overlay ────────────────────────────────────────────────────────────

  _buildHud() {
    this._fartGauge = new FartGauge(this);   // fart-ready meter (replaces control text)

    // Hearts — 5 hearts × 20 energy each
    txt(this, ARENA_W - 6, 5, 'LEO', { fontSize: '8px', color: '#cccccc' })
      .setOrigin(1, 0).setScrollFactor(0).setDepth(20);
    this._heartGfx = [];
    for (let i = 0; i < 5; i++) {
      const g = this.add.graphics().setScrollFactor(0).setDepth(20);
      this._heartGfx.push(g);
    }
    this._updateHearts(); // draw initial full hearts
  }

  // 7×6 pixel-art heart at 3px scale. state: 'full' | 'half' | 'empty'
  _drawHeart(gfx, x, y, state) {
    const S = 3;
    const rows = [
      [0,1,1,0,1,1,0],
      [1,1,1,1,1,1,1],
      [1,1,1,1,1,1,1],
      [0,1,1,1,1,1,0],
      [0,0,1,1,1,0,0],
      [0,0,0,1,0,0,0],
    ];
    gfx.clear();
    // Dark background pass
    gfx.fillStyle(0x330011, 1);
    rows.forEach((row, py) =>
      row.forEach((on, px) => { if (on) gfx.fillRect(x + px * S, y + py * S, S, S); })
    );
    if (state === 'empty') return;
    // Bright fill pass (full = all columns, half = left 4 columns only)
    const maxCol = state === 'full' ? 7 : 4;
    gfx.fillStyle(0xff1155, 1);
    rows.forEach((row, py) =>
      row.forEach((on, px) => { if (on && px < maxCol) gfx.fillRect(x + px * S, y + py * S, S, S); })
    );
  }

  _updateHearts() {
    const e   = Math.max(0, this._resources.energy);
    const full = Math.floor(e / 20);
    const half = (e % 20) >= 10;
    this._heartGfx.forEach((g, i) => {
      const x = ARENA_W - 120 + i * 23;
      const state = i < full ? 'full' : (i === full && half ? 'half' : 'empty');
      this._drawHeart(g, x, 14, state);
    });
  }

  // ─── Input ──────────────────────────────────────────────────────────────────

  _setupInput() {
    this._keys = this.input.keyboard.addKeys({
      up:    Phaser.Input.Keyboard.KeyCodes.W,
      down:  Phaser.Input.Keyboard.KeyCodes.S,
      left:  Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      upAlt:    Phaser.Input.Keyboard.KeyCodes.UP,
      downAlt:  Phaser.Input.Keyboard.KeyCodes.DOWN,
      leftAlt:  Phaser.Input.Keyboard.KeyCodes.LEFT,
      rightAlt: Phaser.Input.Keyboard.KeyCodes.RIGHT,
    });
    this._fartKey  = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);
    this._spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
  }

  // ─── Attack timers ──────────────────────────────────────────────────────────

  _setupAttackTimers() {
    // Thrown pool noodle every 2.8s
    this._noodleTimer = this.time.addEvent({
      delay: 2800,
      loop: true,
      callback: this._throwNoodle,
      callbackScope: this,
    });

    // Squirt gun every 1.6s when close enough
    this._squirtTimer = this.time.addEvent({
      delay: 1600,
      loop: true,
      callback: this._squirt,
      callbackScope: this,
    });
  }

  // ─── Intro cutscene ─────────────────────────────────────────────────────────

  _runIntroCutscene() {
    // Camera starts zoomed on Grace, then pulls back to full arena
    this.cameras.main.zoomTo(2.5, 0, Phaser.Math.Easing.Linear);
    this.cameras.main.pan(this._graceX, this._graceY, 0);

    // Flash alert
    this._alertLabel.setVisible(true);

    this.time.delayedCall(300, () => {
      this.cameras.main.zoomTo(1, 800, Phaser.Math.Easing.Quadratic.Out);
      this.cameras.main.pan(ARENA_W / 2, ARENA_H / 2, 800);
    });

    this.time.delayedCall(1200, () => {
      this._alertLabel.setVisible(false);
      this._inputLocked = false;
      this._graceState = 'PATROL';
    });
  }

  // ─── Main update ────────────────────────────────────────────────────────────

  update() {
    if (this._defeated) return;
    if (this._fxFrozen) return; // hit-stop: freeze the sim for a few frames on impact

    this._updateLeo();
    this._updateGrace();
    this._updateProjectiles();
    this._checkPoolHazard();
    this._checkChairCollision();
    this._checkPuddles();
  }

  _updateLeo() {
    if (this._inputLocked || this._leoStunned) return;

    let vx = 0, vy = 0;
    if (this._keys.left.isDown  || this._keys.leftAlt.isDown)  vx = -LEO_SPEED;
    if (this._keys.right.isDown || this._keys.rightAlt.isDown) vx =  LEO_SPEED;
    if (this._keys.up.isDown    || this._keys.upAlt.isDown)    vy = -LEO_SPEED;
    if (this._keys.down.isDown  || this._keys.downAlt.isDown)  vy =  LEO_SPEED;

    // Normalize diagonal
    if (vx !== 0 && vy !== 0) { vx *= 0.707; vy *= 0.707; }

    const dt = 1 / 60;
    this._leoX = Phaser.Math.Clamp(this._leoX + vx * dt, DECK_LEFT, DECK_RIGHT);
    this._leoY = Phaser.Math.Clamp(this._leoY + vy * dt, DECK_TOP,  DECK_BOTTOM);

    this._moveLeoVisual(vx, vy);

    // Jump
    const now = Date.now();
    if (Phaser.Input.Keyboard.JustDown(this._spaceKey) && !this._isJumping && now >= this._jumpCooldownEnd) {
      this._isJumping    = true;
      this._jumpElapsed  = 0;
      this._jumpCooldownEnd = now + 700;
    }
    if (this._isJumping) {
      this._jumpElapsed += this.game.loop.delta;
      const t = Math.min(this._jumpElapsed / this._jumpDuration, 1);
      this._jumpOffsetY = -Math.round(15 * 4 * t * (1 - t)); // parabola, negative = up
      if (t >= 1) { this._isJumping = false; this._jumpOffsetY = 0; }
    }

    // Fart attack — local cooldown so it always works in the boss scene
    if (Phaser.Input.Keyboard.JustDown(this._fartKey) && this._fartReady) {
      this._fartReady = false;
      AudioManager.playFart(this);
      // Visual ring
      const ring = this.add.circle(this._leoX, this._leoY, 6, 0xf5e642, 0.9).setDepth(8);
      this.tweens.add({
        targets: ring, displayWidth: FART_HIT_RANGE * 2, displayHeight: FART_HIT_RANGE * 2,
        alpha: 0, duration: 400, onComplete: () => ring.destroy(),
      });
      this._checkFartHit();
      this._fartGauge?.trigger(this._fartCooldownMs);
      this.time.delayedCall(this._fartCooldownMs, () => { this._fartReady = true; });
    }
  }

  _checkFartHit() {
    if (this._graceState === 'STUNNED' || this._graceState === 'DEFEATED') return;
    const dx = this._graceX - this._leoX;
    const dy = this._graceY - this._leoY;
    if (dx * dx + dy * dy < FART_HIT_RANGE * FART_HIT_RANGE) {
      this._hitGrace();
    }
  }

  _hitGrace() {
    AudioManager.playSfx(this, 'sfx-girly-grace', { volume: 0.9 });
    this._graceHp--;
    this._graceState = 'STUNNED';
    this._graceBody.setTint(0xffffff);
    this.time.delayedCall(150, () => this._graceBody.clearTint());
    this.time.delayedCall(STUN_DURATION, () => {
      if (this._graceState !== 'DEFEATED') {
        if (this._graceHp <= 0) {
          this._graceState = 'DEFEATED';
          this._defeatGrace();
        } else {
          this._graceState = 'PATROL';
        }
      }
    });
    this._updateGraceHpBar();

    // ── Juice ──────────────────────────────────────────────────────────────
    FX.freeze(this, 60);                   // hit-stop: sim pauses, impact lands
    FX.shake(this, 220, 0.012);            // punchy camera kick
    FX.pop(this, this._graceBody, 0.4);    // Grace squashes on impact

    // Stinky green impact burst around Grace
    FX.burst(this, this._graceX, this._graceY, {
      count: 12,
      colors: [0xd4e157, 0x9ccc65, 0xffffff],
      minSpeed: 40, maxSpeed: 130,
      minSize: 1, maxSize: 4,
      duration: 460, depth: 30,
    });

    // Punchy "POW!" callout + remaining-HP feedback
    const lastHit = this._graceHp <= 0;
    FX.popText(this, this._graceX, this._graceY - 22, lastHit ? 'K.O.!' : 'POW!', {
      color: lastHit ? '#ff5252' : '#ffee58',
      fontSize: lastHit ? '14px' : '12px',
      rise: 30, duration: 750,
    });
  }

  _updateGrace() {
    if (this._graceState === 'STUNNED' || this._graceState === 'DEFEATED') {
      this._syncGraceVisuals();
      return;
    }

    const dx = this._leoX - this._graceX;
    const dy = this._leoY - this._graceY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (this._graceState === 'PATROL') {
      // Bounce along top strip
      this._graceX += this._graceVx * (1 / 60);
      if (this._graceX < 40 || this._graceX > ARENA_W - 40) {
        this._graceVx *= -1;
        this._graceX = Phaser.Math.Clamp(this._graceX, 40, ARENA_W - 40);
      }
      if (dist < CHASE_RANGE) {
        this._graceState = 'CHASE';
        this._alertLabel.setVisible(true);
        this.time.delayedCall(500, () => this._alertLabel.setVisible(false));
      }
    } else if (this._graceState === 'CHASE') {
      if (dist > 4) {
        const nx = dx / dist, ny = dy / dist;
        // Grace wades through the pool — half speed in water, full speed on deck
        const spd = this._graceInPool() ? CHASE_SPEED_WATER : CHASE_SPEED;
        this._graceX += nx * spd * (1 / 60);
        this._graceY += ny * spd * (1 / 60);
      }
      if (dist > CHASE_RANGE * 1.5) this._graceState = 'PATROL';

      // Contact damage
      if (dist < 28) {
        const now = Date.now();
        if (now - this._lastContact > CONTACT_COOLDOWN) {
          this._lastContact = now;
          this._damagePlayer(CONTACT_DAMAGE, 'contact');
        }
      }
    }

    // Clamp Grace to arena bounds
    this._graceX = Phaser.Math.Clamp(this._graceX, 20, ARENA_W - 20);
    this._graceY = Phaser.Math.Clamp(this._graceY, 20, ARENA_H - 20);

    this._syncGraceVisuals();
  }

  _graceInPool() {
    const hw = POOL_W / 2, hh = POOL_H / 2;
    return this._graceX > POOL_X - hw && this._graceX < POOL_X + hw &&
           this._graceY > POOL_Y - hh && this._graceY < POOL_Y + hh;
  }

  _syncGraceVisuals() {
    this._graceBody.setPosition(this._graceX, this._graceY);
    this._alertLabel.setPosition(this._graceX, this._graceY - 30);
  }

  _updateGraceHpBar() {
    const pct = this._graceHp / GRACE_MAX_HP;
    this._graceHpFill.setDisplaySize(156 * pct, 6);
    this._graceHpFill.setFillStyle(pct > 0.5 ? 0xff2222 : 0xff8800);
  }

  // ─── Projectiles ────────────────────────────────────────────────────────────

  _throwNoodle() {
    if (this._inputLocked || this._graceState === 'DEFEATED') return;
    const dx = this._leoX - this._graceX;
    const dy = this._leoY - this._graceY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 8) return;
    const nx = dx / dist, ny = dy / dist;

    const noodle = this.textures.exists('sprite-pool-noodle')
      ? this.add.image(this._graceX, this._graceY, 'sprite-pool-noodle').setDisplaySize(56, 20).setDepth(4)
      : this.add.rectangle(this._graceX, this._graceY, 48, 12, 0x44cc44).setDepth(4);
    noodle.angle = Math.atan2(ny, nx) * (180 / Math.PI);
    this._projectiles.push({
      obj: noodle, vx: nx * NOODLE_SPEED, vy: ny * NOODLE_SPEED,
      damage: NOODLE_DAMAGE, type: 'noodle',
      wavePhase: 0, waveAmp: 22, waveFreq: 2.8,
      perpVx: -ny, perpVy: nx,  // unit vector perpendicular to flight direction
    });
  }

  _squirt() {
    if (this._inputLocked || this._graceState === 'DEFEATED') return;
    const dx = this._leoX - this._graceX;
    const dy = this._leoY - this._graceY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 180) return; // squirt gun has limited range
    const nx = dx / dist, ny = dy / dist;

    const drop = this.add.circle(this._graceX, this._graceY, 4, 0x4db8f0).setDepth(4);
    const range = SQUIRT_MIN_RANGE + Math.random() * (SQUIRT_MAX_RANGE - SQUIRT_MIN_RANGE);
    this._projectiles.push({
      obj: drop, vx: nx * SQUIRT_SPEED, vy: ny * SQUIRT_SPEED,
      damage: SQUIRT_DAMAGE, type: 'squirt',
      startX: this._graceX, startY: this._graceY, maxRange: range,
    });
  }

  _updateProjectiles() {
    const dt = 1 / 60;
    for (let i = this._projectiles.length - 1; i >= 0; i--) {
      const p = this._projectiles[i];
      p.obj.x += p.vx * dt;
      p.obj.y += p.vy * dt;

      if (p.type === 'noodle') {
        // Tumble spin
        p.obj.angle += 220 * dt;
        // Sinusoidal wobble perpendicular to flight path
        const prevOffset = Math.sin(p.wavePhase) * p.waveAmp;
        p.wavePhase += dt * p.waveFreq * Math.PI * 2;
        const deltaOffset = Math.sin(p.wavePhase) * p.waveAmp - prevOffset;
        p.obj.x += deltaOffset * p.perpVx;
        p.obj.y += deltaOffset * p.perpVy;
      }

      // Squirt: check max range — land as puddle if it hits the deck before reaching Leo
      if (p.type === 'squirt' && p.maxRange !== undefined) {
        const dx2 = p.obj.x - p.startX, dy2 = p.obj.y - p.startY;
        if (dx2 * dx2 + dy2 * dy2 >= p.maxRange * p.maxRange) {
          if (this._isOnDeck(p.obj.x, p.obj.y)) this._createPuddle(p.obj.x, p.obj.y);
          p.obj.destroy();
          this._projectiles.splice(i, 1);
          continue;
        }
      }

      // Out of bounds
      if (p.obj.x < 0 || p.obj.x > ARENA_W || p.obj.y < 0 || p.obj.y > ARENA_H) {
        p.obj.destroy();
        this._projectiles.splice(i, 1);
        continue;
      }

      // Hit Leo
      const dx = p.obj.x - this._leoX;
      const dy = p.obj.y - this._leoY;
      if (dx * dx + dy * dy < (T * 1.5) * (T * 1.5)) {
        this._damagePlayer(p.damage, p.type);
        p.obj.destroy();
        this._projectiles.splice(i, 1);
      }
    }
  }

  // ─── Pool hazard ────────────────────────────────────────────────────────────

  _checkPoolHazard() {
    if (this._leoStunned) return;
    const hw = POOL_W / 2, hh = POOL_H / 2;
    if (
      this._leoX > POOL_X - hw + 8 && this._leoX < POOL_X + hw - 8 &&
      this._leoY > POOL_Y - hh + 8 && this._leoY < POOL_Y + hh - 8
    ) {
      const splashX = this._leoX, splashY = this._leoY;

      // Push Leo out to nearest pool edge + extra distance
      const dLeft  = this._leoX - (POOL_X - hw);
      const dRight = (POOL_X + hw) - this._leoX;
      const dTop   = this._leoY - (POOL_Y - hh);
      const dBot   = (POOL_Y + hh) - this._leoY;
      const minD   = Math.min(dLeft, dRight, dTop, dBot);
      if      (minD === dLeft)  this._leoX = POOL_X - hw - POOL_PUSH_DIST;
      else if (minD === dRight) this._leoX = POOL_X + hw + POOL_PUSH_DIST;
      else if (minD === dTop)   this._leoY = POOL_Y - hh - POOL_PUSH_DIST;
      else                      this._leoY = POOL_Y + hh + POOL_PUSH_DIST;
      this._leoX = Phaser.Math.Clamp(this._leoX, DECK_LEFT, DECK_RIGHT);
      this._leoY = Phaser.Math.Clamp(this._leoY, DECK_TOP,  DECK_BOTTOM);

      // Stun
      this._leoStunned = true;
      this.time.delayedCall(POOL_STUN_MS, () => { this._leoStunned = false; });

      // Splash SFX
      AudioManager.playSfx(this, 'sfx-splash', { volume: 0.9 });

      // Water ripple at entry point
      const ripple = this.add.circle(splashX, splashY, 6, 0x4db8f0, 0.85).setDepth(6);
      this.tweens.add({ targets: ripple, scaleX: 7, scaleY: 7, alpha: 0, duration: 650,
        onComplete: () => ripple.destroy() });

      // Blue camera flash
      this.cameras.main.flash(300, 0, 120, 255);

      // Floating "SPLASH!" text
      const t = txt(this, splashX, splashY - 12, 'SPLASH!', { fontSize: '8px', color: '#88ddff' })
        .setOrigin(0.5).setDepth(10);
      this.tweens.add({ targets: t, y: t.y - 20, alpha: 0, duration: 900, onComplete: () => t.destroy() });

      // Leo blinks while stunned
      const leoVisual = this._leoSprite ?? this._leoBody;
      if (leoVisual) {
        this.tweens.add({ targets: leoVisual, alpha: 0.25, duration: 180, yoyo: true, repeat: 4,
          onComplete: () => leoVisual.setAlpha(1) });
      }
    }
  }

  // ─── Damage player ──────────────────────────────────────────────────────────

  _damagePlayer(amount, source) {
    // Global mercy window — absorb anything that lands during it (the caller still
    // clears its projectile/contact, it just deals no damage). Prevents multiple
    // hazards stacking into an instant multi-heart loss.
    const now = Date.now();
    if (now - (this._lastDamage || 0) < DAMAGE_IFRAME) return;
    this._lastDamage = now;

    this._resources.applyChanges({ energy: -amount });
    this._updateHearts();
    const color = source === 'squirt' ? [0, 100, 255] : [255, 50, 50];
    this.cameras.main.flash(180, color[0], color[1], color[2]);

    // ── Juice ──────────────────────────────────────────────────────────────
    FX.shake(this, 200, 0.01);
    const burstColor = source === 'squirt'
      ? [0x4fc3f7, 0x81d4fa, 0xffffff]   // water droplets
      : [0xff5252, 0xff8a80, 0xffffff];  // ow-red
    FX.burst(this, this._leoX, this._leoY, {
      count: 9, colors: burstColor,
      minSpeed: 35, maxSpeed: 100, minSize: 1, maxSize: 3,
      duration: 420, depth: 30,
    });
    FX.popText(this, this._leoX, this._leoY - 18, `-${amount}`, {
      color: source === 'squirt' ? '#4fc3f7' : '#ff5252',
      fontSize: '9px', rise: 22, duration: 600,
    });

    if (this._resources.isExhausted()) {
      this._gameOver();
    }
  }

  _gameOver() {
    this._defeated = true;
    this._noodleTimer?.remove();
    this._squirtTimer?.remove();

    if (!this._gauntlet) {
      this.cameras.main.fade(600, 0, 0, 0, false, (cam, progress) => {
        if (progress === 1) {
          this.scene.wake(SCENE_HUD);
          this.scene.start(SCENE_NEIGHBORHOOD, {
            bossLost: 'grace', bossScene: SCENE_GRACE_BOSS, spawnCol: 122, spawnRow: 65,
          });
        }
      });
      return;
    }

    // Gauntlet mode: Grace steals half the donuts, Leo's energy resets, fight continues
    const donuts    = this._gauntletData.donuts ?? 0;
    const stolen    = Math.ceil(donuts / 2);
    const newDonuts = donuts - stolen;
    this._resources.applyChanges({ energy: 100 - this._resources.energy });
    this._gauntletData = { ...this._gauntletData, donuts: newDonuts };

    const msg = stolen > 0
      ? `GRACE STEALS ${stolen} DONUT${stolen !== 1 ? 'S' : ''}!`
      : 'GRACE TRIES TO STEAL — BUT YOU HAD NONE LEFT!';

    const overlay = this.add.rectangle(BASE_WIDTH / 2, BASE_HEIGHT / 2, BASE_WIDTH, BASE_HEIGHT, 0x000000, 0.78).setDepth(40);
    const t1 = txt(this, BASE_WIDTH / 2, BASE_HEIGHT / 2 - 16, 'YOU LOST!', { fontSize: '12px', color: '#ff4444' }).setOrigin(0.5).setDepth(41);
    const t2 = txt(this, BASE_WIDTH / 2, BASE_HEIGHT / 2 + 4,  msg,         { fontSize: '8px',  color: '#f5a623' }).setOrigin(0.5).setDepth(41);
    const t3 = txt(this, BASE_WIDTH / 2, BASE_HEIGHT / 2 + 20, `DONUTS LEFT: ${newDonuts}`, { fontSize: '8px', color: '#aaaaaa' }).setOrigin(0.5).setDepth(41);

    this.time.delayedCall(2400, () => {
      [overlay, t1, t2, t3].forEach(o => o.destroy());
      this.cameras.main.fade(400, 0, 0, 0);
      this.time.delayedCall(420, () => {
        this.scene.start(SCENE_BOSS_GAUNTLET, this._gauntletData);
      });
    });
  }

  // ─── Offer donut recharge after a gauntlet win ───────────────────────────────
  _offerDonutRecharge(onDone) {
    const energy = this._resources.energy;
    const donuts = this._gauntletData.donuts ?? 0;
    if (energy >= 100 || donuts <= 0) { onDone(); return; }

    const overlay = this.add.rectangle(BASE_WIDTH / 2, BASE_HEIGHT / 2, BASE_WIDTH, BASE_HEIGHT, 0x000000, 0.82).setDepth(40);
    txt(this, BASE_WIDTH / 2, BASE_HEIGHT / 2 - 24, 'ENERGY LOW!', { fontSize: '10px', color: '#ff8888' }).setOrigin(0.5).setDepth(41);
    txt(this, BASE_WIDTH / 2, BASE_HEIGHT / 2 - 8, `EAT A DONUT TO RECHARGE?  (${donuts} left)`, { fontSize: '7px', color: '#f5e642' }).setOrigin(0.5).setDepth(41);

    const yesBg = this.add.rectangle(BASE_WIDTH / 2 - 36, BASE_HEIGHT / 2 + 14, 60, 14, 0x1a3a1a).setDepth(41).setInteractive({ useHandCursor: true });
    txt(this, BASE_WIDTH / 2 - 36, BASE_HEIGHT / 2 + 14, 'YES', { fontSize: '8px', color: '#88ff88' }).setOrigin(0.5).setDepth(42);
    const noBg  = this.add.rectangle(BASE_WIDTH / 2 + 36, BASE_HEIGHT / 2 + 14, 60, 14, 0x2a1a1a).setDepth(41).setInteractive({ useHandCursor: true });
    txt(this, BASE_WIDTH / 2 + 36, BASE_HEIGHT / 2 + 14, 'NO', { fontSize: '8px', color: '#ff8888' }).setOrigin(0.5).setDepth(42);

    const cleanup = () => this.children.list.filter(c => c.depth >= 40).forEach(c => c.destroy());

    yesBg.once('pointerdown', () => {
      this._gauntletData = { ...this._gauntletData, donuts: donuts - 1 };
      this._resources.applyChanges({ energy: 100 - this._resources.energy });
      cleanup();
      onDone();
    });
    noBg.once('pointerdown', () => { cleanup(); onDone(); });
  }

  // ─── Deck obstacle collision ────────────────────────────────────────────────

  // Puddles left by water gun shots — jump over or take splash damage
  _checkPuddles() {
    if (this._isJumping) return;
    const now = Date.now();
    if (now - this._deckHitCooldown < 1200) return;
    for (const p of this._puddles) {
      if (!p.obj.active) continue;
      // Hitbox matched to the 22x11 puddle sprite (was 28x20 — splashed you when
      // you were merely near a puddle, not on it).
      if (Math.abs(this._leoX - p.obj.x) < 10 && Math.abs(this._leoY - p.obj.y) < 6) {
        this._deckHitCooldown = now;
        this._damagePlayer(PUDDLE_DAMAGE, 'squirt');
        return;
      }
    }
  }

  _createPuddle(x, y) {
    // Cap how many puddles coexist so the deck never gets walled off — evaporate
    // the oldest early once we're at the limit.
    const MAX_PUDDLES = 4;
    while (this._puddles.length >= MAX_PUDDLES) {
      const oldest = this._puddles.shift();
      if (oldest?.obj?.active) { this.tweens.killTweensOf(oldest.obj); oldest.obj.destroy(); }
    }

    const duration = Phaser.Math.Between(6000, 8000);   // ~6-8s, then it evaporates
    const puddle = this.add.ellipse(x, y, 22, 11, 0x4db8f0, 0.7).setDepth(3);
    this._puddles.push({ obj: puddle });

    // Fade out and evaporate
    this.time.delayedCall(duration - 1500, () => {
      if (puddle.active) {
        this.tweens.add({ targets: puddle, alpha: 0, duration: 1500,
          onComplete: () => { puddle.destroy(); this._puddles = this._puddles.filter(p => p.obj !== puddle); }
        });
      }
    });
  }

  _isOnDeck(x, y) {
    if (x < DECK_LEFT || x > DECK_RIGHT || y < DECK_TOP || y > DECK_BOTTOM) return false;
    const hw = POOL_W / 2, hh = POOL_H / 2;
    return !(x > POOL_X - hw && x < POOL_X + hw && y > POOL_Y - hh && y < POOL_Y + hh);
  }

  // Lawn chairs: solid blockers — push Leo out, no damage
  _checkChairCollision() {
    for (const c of this._chairs) {
      const hw = c.w / 2 + 8, hh = c.h / 2 + 8;
      if (this._leoX > c.x - hw && this._leoX < c.x + hw &&
          this._leoY > c.y - hh && this._leoY < c.y + hh) {
        const overlapL = this._leoX - (c.x - hw);
        const overlapR = (c.x + hw) - this._leoX;
        const overlapT = this._leoY - (c.y - hh);
        const overlapB = (c.y + hh) - this._leoY;
        const min = Math.min(overlapL, overlapR, overlapT, overlapB);
        if      (min === overlapL) this._leoX = c.x - hw;
        else if (min === overlapR) this._leoX = c.x + hw;
        else if (min === overlapT) this._leoY = c.y - hh;
        else                       this._leoY = c.y + hh;
      }
    }
  }

  // ─── Grace defeat ───────────────────────────────────────────────────────────

  _defeatGrace() {
    this._defeated = true;
    this._noodleTimer?.remove();
    this._squirtTimer?.remove();

    // Clear remaining projectiles and puddles
    this._projectiles.forEach(p => p.obj.destroy());
    this._projectiles = [];
    this._puddles.forEach(p => p.obj?.destroy());
    this._puddles = [];

    // Victory flash
    this.cameras.main.flash(300, 255, 255, 100);

    // Spin out Grace
    this.tweens.add({
      targets: [this._graceBody],
      alpha: 0, angle: 360, duration: 700,
      onComplete: () => {
        this._graceBody.destroy();
        this._graceHpBg.destroy();
        this._graceHpFill.destroy();

        // Show post-fight dialogue then return to neighborhood
        // DIALOGUE is already a persistent parallel scene — don't launch/stop it
        const victoryScript = this._gauntlet ? 'gauntlet_grace_win' : 'warren_after_grace';
        this.scene.get(SCENE_DIALOGUE).showScript(victoryScript, () => {
          if (this._gauntlet) {
            this._offerDonutRecharge(() => {
              this.cameras.main.fade(500, 0, 0, 0);
              this.time.delayedCall(520, () => this.scene.start(SCENE_BOSS_GAUNTLET, this._gauntletData));
            });
          } else {
            this.cameras.main.fade(500, 0, 0, 0);
            this.time.delayedCall(520, () => {
              this.scene.wake(SCENE_HUD);
              this.scene.start(SCENE_NEIGHBORHOOD, { graceDefeated: true, spawnCol: 122, spawnRow: 65 });
            });
          }
        });
      },
    });
  }
}
