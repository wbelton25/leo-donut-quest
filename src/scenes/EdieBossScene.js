import {
  SCENE_EDIE_BOSS, SCENE_BOSS_GAUNTLET, SCENE_DIALOGUE, SCENE_GAME_OVER, SCENE_CREDITS, SCENE_HUD,
  BASE_WIDTH, BASE_HEIGHT, txt, MUSIC_BOSS,
} from '../constants.js';
import AudioManager from '../systems/AudioManager.js';
import FX from '../systems/FX.js';
import { createHearts, createBossBar } from '../ui/BossHud.js';

// EdieBossScene: Edie — Leo's older sister (2 years older) — the FINAL boss,
// deliberately unlike the four sibling chase-fights. She's after Leo's donuts.
//
// She holds the high ground upstairs on a landing (out of fart range), pelting
// Leo with her stuffed animals. The loop:
//   1. Dodge the falling stuffies (run; jump the shockwave).
//   2. Grab a landed stuffie (run over it) and THROW it back up at Edie (F).
//   3. A reflected stuffie stuns her — she tumbles to the floor, dazed.
//   4. Rush over and FART her (F) while she's down for damage.
//   5. She climbs back up; repeat, escalating each hit.
//
// Extra attack (phase 2+): she leaps down and GROUND-POUNDS, sending a shockwave
// rolling across the floor that Leo must JUMP (SPACE) over.
//
// F is contextual: throw when holding a stuffie, fart when empty-handed.
// 3 HP. Defeat → back to BossGauntletScene with the winner flag.

const ARENA_W = BASE_WIDTH;
const ARENA_H = BASE_HEIGHT;

const EDIE_COLOR = 0xff69b4;
const EDIE_HP    = 5;
const LEO_SPEED  = 160;
const FART_RADIUS = 64;
const FART_CD     = 1500;

// ── Vertical layout ──────────────────────────────────────────────────────────
const PERCH_Y   = 46;                 // Edie's upstairs perch
const RAIL_Y    = 66;                 // landing ledge / railing line
const FLOOR_TOP = 205;                // front edge of the real hardwood floor
const FLOOR_BOT = ARENA_H - 16;       // Leo's band is the floor only (no floating on the wall)
const PERCH_L   = 58, PERCH_R = ARENA_W - 58;
const PERCH_SPEED = 78;   // paces the landing quickly + erratically
const EDIE_FLOOR_Y = FLOOR_BOT - 24;  // where Edie ends up when down at floor level

// ── Stuffies ─────────────────────────────────────────────────────────────────
const STUFFIE_GRAV     = 340;   // downward accel for falling stuffies
const THROW_UP_SPEED   = 375;   // reflect speed (helps land on a faster-moving Edie)
const STUFFIE_LIFESPAN = 6000;  // ms a landed stuffie waits to be grabbed
const STUFFIE_COLORS   = [0xd98cc8, 0x8cc8d9, 0xd9c88c, 0xa8d98c, 0xd98c8c, 0xb0a0e0];

// ── Timing ───────────────────────────────────────────────────────────────────
const STUN_MS      = 2600;   // dazed-on-floor window after a reflect hit
const SLAM_VULN_MS = 1300;   // brief vulnerable window after a ground-pound
const WINDUP_MS    = 1150;   // ground-pound telegraph (long, clearly readable)

// ── Jump (dodge the shockwave) ───────────────────────────────────────────────
const JUMP_MS = 500;
const JUMP_H  = 26;

// ── Shockwave ────────────────────────────────────────────────────────────────
const SHOCK_SPEED = 165;

export default class EdieBossScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_EDIE_BOSS });
  }

  init(data) {
    this._gauntletData = data ?? {};
  }

  create() {
    AudioManager.playMusic(this, MUSIC_BOSS);
    this.scene.sleep(SCENE_HUD);

    this._buildArena();

    // ── Edie ──────────────────────────────────────────────────────────────────
    this._edieHP    = EDIE_HP;
    this._edieX     = ARENA_W / 2;
    this._edieY     = PERCH_Y;
    if (this.textures.exists('sprite-edie-char')) {
      this._edieSprite = this.add.image(this._edieX, this._edieY, 'sprite-edie-char').setDepth(6);
      this._edieSprite.setScale(46 / this._edieSprite.height);
      this._edieImg = true;
    } else {
      this._edieSprite = this.add.rectangle(this._edieX, this._edieY, 16, 22, EDIE_COLOR).setDepth(6);
      this._edieImg = false;
    }
    this._edieBaseScale = this._edieSprite.scaleX;
    this._edieBarUpdate = createBossBar(this, ARENA_W, EDIE_COLOR);

    // Ground-pound telegraph — a danger column + "!" shown during the wind-up
    this._slamWarnLine = this.add.rectangle(0, (RAIL_Y + FLOOR_BOT) / 2, 46, FLOOR_BOT - RAIL_Y, 0xff4466, 0.16)
      .setDepth(2).setVisible(false);
    this._slamWarnMark = txt(this, 0, 0, '!', { fontSize: '14px', color: '#ff5566', stroke: '#000', strokeThickness: 3 })
      .setOrigin(0.5).setDepth(11).setVisible(false);

    // Dizzy stars (shown while stunned) — drawn shapes (font is ASCII-only)
    this._stars = this.add.container(0, 0).setDepth(9).setVisible(false);
    this._stars.add([
      this.add.star(-7, 0, 5, 2, 4, 0xffe14d),
      this.add.star(0, -3, 5, 2, 4, 0xfff2a0),
      this.add.star(7, 0, 5, 2, 4, 0xffe14d),
    ]);

    // ── Leo ───────────────────────────────────────────────────────────────────
    this._leoX = ARENA_W / 2;
    this._leoY = FLOOR_BOT - 24;
    this._leoShadow = this.add.ellipse(this._leoX, this._leoY + 10, 20, 6, 0x000000, 0.3).setDepth(4);
    if (this.textures.exists('sprite-leo-foot')) {
      this._leoSprite = this.add.image(this._leoX, this._leoY, 'sprite-leo-foot').setDepth(5);
      this._leoSprite.setScale(34 / this._leoSprite.height).setOrigin(0.5, 0.62); // feet near _leoY
      this._leoImg = true;
    } else {
      this._leoSprite = this.add.rectangle(this._leoX, this._leoY, 12, 16, 0x3b82f6).setDepth(5);
      this._leoImg = false;
    }

    // ── Input ─────────────────────────────────────────────────────────────────
    this._cursors = this.input.keyboard.createCursorKeys();
    this._wasd    = this.input.keyboard.addKeys('W,A,S,D');
    this._fartKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);
    this._jumpKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    // ── State ─────────────────────────────────────────────────────────────────
    this._edieState  = 'PERCH';       // PERCH | WINDUP | SLAM | STUNNED | CLIMB | DEFEATED
    this._edieVuln   = false;         // fart connects only when true (she's down low)
    this._perchDir   = 1;
    this._stateTimer = 0;
    this._throwTimer = 1400;
    this._slamTimer  = 6500;

    this._stuffies = [];   // { c, state:'fall'|'land'|'held'|'up', vx, vy, life }
    this._shocks   = [];   // { obj, dir }
    this._held     = null; // stuffie Leo is carrying

    this._fartReady    = true;
    this._fartCd       = 0;
    this._hitFlash     = 0;
    this._leoHitCd     = 0;
    this._leoJumping   = false;
    this._leoJumpT     = 0;
    this._leoHP        = 5;
    this._defeated     = false;
    this._gameover     = false;

    this._heartsUpdate = createHearts(this, ARENA_W);

    txt(this, ARENA_W / 2, ARENA_H - 9, 'WASD: MOVE   F: THROW / FART   SPACE: JUMP',
      { fontSize: '8px', color: '#778899' }).setOrigin(0.5).setDepth(10);
  }

  _buildArena() {
    if (this.textures.exists('bg-edie')) {
      // Real background already depicts the landing + railing, so no procedural rail.
      this.add.image(0, 0, 'bg-edie').setOrigin(0, 0).setDisplaySize(ARENA_W, ARENA_H).setDepth(-1);
      return;
    }

    // ── Procedural fallback: two-tier room + drawn railing ─────────────────────
    this.add.rectangle(ARENA_W / 2, ARENA_H / 2, ARENA_W, ARENA_H, 0x3a2a2e);
    this.add.rectangle(ARENA_W / 2, RAIL_Y / 2, ARENA_W, RAIL_Y, 0x2c2028);               // upstairs band
    this.add.rectangle(ARENA_W / 2, (RAIL_Y + ARENA_H) / 2, ARENA_W, ARENA_H - RAIL_Y, 0x4a3630); // floor

    this.add.rectangle(ARENA_W / 2, RAIL_Y, ARENA_W, 6, 0x6b4a5a).setDepth(1);
    for (let x = 12; x < ARENA_W; x += 22) {
      this.add.rectangle(x, RAIL_Y - 7, 3, 12, 0x8a6a7a, 0.9).setDepth(1);
    }
    this.add.rectangle(ARENA_W / 2, RAIL_Y - 13, ARENA_W, 3, 0x8a6a7a).setDepth(1); // handrail
  }

  // ═══════════════════════════════════════════════════════════════════════════
  update(time, delta) {
    if (this._defeated || this._gameover) return;
    if (this._fxFrozen) return; // hit-stop
    const dt = delta / 1000;

    this._moveLeo(dt, delta);
    this._updateEdie(dt, delta);
    this._updateStuffies(dt, delta);
    this._updateShocks(dt);
    this._handleFart(delta);
    if (this._hitFlash > 0) {
      this._hitFlash -= delta;
      this._edieTint(this._hitFlash % 200 < 100 ? 0xffffff : null);
      if (this._hitFlash <= 0) this._edieTint(null);
    }
    if (this._leoHitCd > 0) this._leoHitCd -= delta;
  }

  // ── Leo ────────────────────────────────────────────────────────────────────
  _moveLeo(dt, delta) {
    let vx = 0, vy = 0;
    const k = this._cursors, w = this._wasd;
    if (k.left.isDown  || w.A.isDown) vx = -LEO_SPEED;
    if (k.right.isDown || w.D.isDown) vx =  LEO_SPEED;
    if (k.up.isDown    || w.W.isDown) vy = -LEO_SPEED;
    if (k.down.isDown  || w.S.isDown) vy =  LEO_SPEED;
    if (vx !== 0 && vy !== 0) { vx *= 0.707; vy *= 0.707; }
    this._leoX = Phaser.Math.Clamp(this._leoX + vx * dt, 18, ARENA_W - 18);
    this._leoY = Phaser.Math.Clamp(this._leoY + vy * dt, FLOOR_TOP, FLOOR_BOT);

    // Jump (dodge the shockwave)
    if (Phaser.Input.Keyboard.JustDown(this._jumpKey) && !this._leoJumping) {
      this._leoJumping = true;
      this._leoJumpT = 0;
    }
    let jumpH = 0;
    if (this._leoJumping) {
      this._leoJumpT += delta;
      const t = Math.min(this._leoJumpT / JUMP_MS, 1);
      jumpH = JUMP_H * 4 * t * (1 - t);
      if (t >= 1) this._leoJumping = false;
    }
    this._leoAirborne = jumpH > 9;

    this._leoShadow.setPosition(this._leoX, this._leoY + 10).setScale(1 - jumpH / 60);
    this._leoSprite.setPosition(this._leoX, this._leoY - jumpH);
  }

  // ── Edie AI / state machine ──────────────────────────────────────────────────
  _updateEdie(dt, delta) {
    const s = this._edieState;

    if (s === 'PERCH') {
      // Pace along the landing — fast, with occasional erratic direction changes
      this._edieX += this._perchDir * PERCH_SPEED * dt;
      if (this._edieX <= PERCH_L || this._edieX >= PERCH_R) {
        this._perchDir *= -1;
        this._edieX = Phaser.Math.Clamp(this._edieX, PERCH_L, PERCH_R);
      } else if (Math.random() < 0.01) {
        this._perchDir *= -1; // random juke — harder to predict/aim at
      }
      // Throw stuffies down on an unpredictable cadence
      this._throwTimer -= delta;
      if (this._throwTimer <= 0) {
        this._throwDown();
        this._throwTimer = this._throwInterval();
      }
      // Ground-pound — more frequent the more she's been hit (phase 2+)
      if (this._phase() >= 2) {
        this._slamTimer -= delta;
        if (this._slamTimer <= 0) {
          this._edieState = 'WINDUP';
          this._stateTimer = WINDUP_MS;
          this._slamTimer = this._slamInterval();
        }
      }

    } else if (s === 'WINDUP') {
      // Telegraph: bright flash + danger column + "!" so the slam is well-signalled
      const on = Math.floor(this.time.now / 110) % 2 === 0;
      this._edieTint(on ? 0xffffff : 0xffdd33);
      this._slamWarnLine.setVisible(true).setX(this._edieX).setAlpha(on ? 0.32 : 0.12);
      this._slamWarnMark.setVisible(true).setPosition(this._edieX, this._edieY - 22).setAlpha(on ? 1 : 0.35);
      this._stateTimer -= delta;
      if (this._stateTimer <= 0) {
        this._edieTint(null);
        this._hideSlamWarn();
        this._startSlam();
      }

    } else if (s === 'SLAM') {
      // Handled by tweens; vulnerable window ticks down
      this._stateTimer -= delta;
      if (this._stateTimer <= 0 && this._edieVuln) this._climb();

    } else if (s === 'STUNNED') {
      this._stateTimer -= delta;
      // Dizzy stars spin above her
      this._stars.setVisible(true).setPosition(this._edieX, this._edieY - 22);
      this._stars.angle += 4;
      if (this._stateTimer <= 0) this._climb();
    }

    this._edieSprite.setPosition(this._edieX, this._edieY);
  }

  // Map remaining HP to 3 escalating phases (slams begin at phase 2).
  _phase() {
    if (this._edieHP >= 4) return 1; // HP 5-4: learn the reflect loop, no slams
    if (this._edieHP >= 2) return 2; // HP 3-2: slams begin
    return 3;                        // HP 1: full aggression
  }

  _hideSlamWarn() {
    if (this._slamWarnLine) this._slamWarnLine.setVisible(false);
    if (this._slamWarnMark) this._slamWarnMark.setVisible(false);
  }

  // Randomised gap between throws — faster and more erratic each phase
  _throwInterval() {
    const [lo, hi] = [[1400, 2300], [850, 1600], [600, 1150]][this._phase() - 1];
    return Phaser.Math.Between(lo, hi);
  }

  // Slam cadence tightens with every hit (only phase 2+; phase 1 never slams)
  _slamInterval() {
    return ({ 3: 5000, 2: 3800, 1: 2600 })[this._edieHP] ?? Infinity;
  }

  _throwDown(isBurst = false) {
    const count = this._phase() >= 3 ? (Math.random() < 0.5 ? 3 : 1)
                : this._phase() >= 2 ? (Math.random() < 0.35 ? 2 : 1)
                : 1;
    for (let i = 0; i < count; i++) {
      const spreadX = (i - (count - 1) / 2) * 60;
      const jitter  = Phaser.Math.Between(-24, 24); // aim isn't perfectly on Leo
      const targetX = Phaser.Math.Clamp(this._leoX + spreadX + jitter, 20, ARENA_W - 20);
      const st = this._makeStuffie(this._edieX, PERCH_Y + 8);
      st.state = 'fall';
      st.vx = (targetX - this._edieX) * 0.55;
      st.vy = 40;
      this._stuffies.push(st);
    }

    // Erratic burst: sometimes a quick surprise follow-up throw (phase 2+)
    if (!isBurst && this._phase() >= 2 && Math.random() < 0.3) {
      this.time.delayedCall(230, () => {
        if (!this._defeated && this._edieState === 'PERCH') this._throwDown(true);
      });
    }
  }

  _startSlam() {
    this._edieState = 'SLAM';
    this.tweens.killTweensOf(this._edieSprite);
    // Leap from perch down to the floor at her current x
    this.tweens.add({
      targets: this._edieSprite, y: EDIE_FLOOR_Y, duration: 300, ease: 'Quad.easeIn',
      onUpdate: () => { this._edieY = this._edieSprite.y; },
      onComplete: () => {
        this._edieY = EDIE_FLOOR_Y;
        this.cameras.main.shake(240, 0.012);
        FX.burst(this, this._edieX, FLOOR_BOT, {
          count: 14, colors: [0xd9a0c0, 0xffffff, 0x9a7a8a],
          minSpeed: 50, maxSpeed: 150, minSize: 1, maxSize: 3, duration: 420, depth: 8,
        });
        // Shockwaves roll out both ways
        this._spawnShock(-1);
        this._spawnShock(1);
        // Brief floor-level vulnerable window
        this._edieVuln = true;
        this._stateTimer = SLAM_VULN_MS;
      },
    });
  }

  _spawnShock(dir) {
    // A full-height wave across the play area — can't be walked around, only jumped.
    const cy = (FLOOR_TOP + FLOOR_BOT) / 2;
    const h  = FLOOR_BOT - FLOOR_TOP + 4;
    const obj = this.add.rectangle(this._edieX, cy, 9, h, 0xff9ad0, 0.45)
      .setStrokeStyle(2, 0xffffff, 0.85).setDepth(7);
    this._shocks.push({ obj, dir });
  }

  _climb() {
    this._edieVuln = false;
    this._stars.setVisible(false);
    this._edieState = 'CLIMB';
    this.tweens.killTweensOf(this._edieSprite);
    this._edieSprite.setAngle(0).setScale(this._edieBaseScale);
    this.tweens.add({
      targets: this._edieSprite, y: PERCH_Y, duration: 420, ease: 'Quad.easeOut',
      onUpdate: () => { this._edieY = this._edieSprite.y; },
      onComplete: () => {
        this._edieY = PERCH_Y;
        this._edieState = 'PERCH';
        this._edieSprite.setAngle(0);
      },
    });
  }

  _stunEdie() {
    if (this._edieState !== 'PERCH' && this._edieState !== 'WINDUP') return;
    this._hideSlamWarn();
    this._edieState = 'STUNNED';
    this._edieVuln = true;
    this._stateTimer = STUN_MS;
    AudioManager.playSfx(this, 'sfx-girly-edie', { volume: 0.7 });
    // Tumble down to the floor, spinning
    this.tweens.killTweensOf(this._edieSprite);
    this.tweens.add({ targets: this._edieSprite, angle: 360, duration: 500 });
    this.tweens.add({
      targets: this._edieSprite, y: EDIE_FLOOR_Y, duration: 450, ease: 'Bounce.easeOut',
      onUpdate: () => { this._edieY = this._edieSprite.y; },
      onComplete: () => { this._edieY = EDIE_FLOOR_Y; },
    });
    FX.popText(this, this._edieX, this._edieY - 16, 'OW!', { color: '#ffe14d', fontSize: '10px', rise: 20, duration: 700 });
  }

  // ── Stuffies ─────────────────────────────────────────────────────────────────
  _makeStuffie(x, y) {
    const color = STUFFIE_COLORS[Phaser.Math.Between(0, STUFFIE_COLORS.length - 1)];
    const c = this.add.container(x, y).setDepth(8);
    const body = this.add.ellipse(0, 2, 12, 11, color);
    const head = this.add.ellipse(0, -5, 8, 7, color);
    const earL = this.add.circle(-4, -8, 2.5, color);
    const earR = this.add.circle(4, -8, 2.5, color);
    const belly = this.add.ellipse(0, 3, 6, 5, 0xffffff, 0.5);
    c.add([body, earL, earR, head, belly]);
    return { c, x, y, vx: 0, vy: 0, state: 'fall', life: STUFFIE_LIFESPAN };
  }

  _updateStuffies(dt, delta) {
    // Auto-pick-up a landed stuffie if empty-handed and grounded (but not while
    // Edie is down — keep hands free to fart her during the punish window)
    if (!this._held && !this._leoAirborne && !this._edieVuln) {
      for (const st of this._stuffies) {
        if (st.state !== 'land') continue;
        if (Math.abs(st.x - this._leoX) < 15 && Math.abs(st.y - this._leoY) < 16) {
          st.state = 'held';
          this._held = st;
          AudioManager.playSfx(this, 'sfx-girly-edie', { volume: 0.3 });
          break;
        }
      }
    }

    for (let i = this._stuffies.length - 1; i >= 0; i--) {
      const st = this._stuffies[i];

      if (st.state === 'fall') {
        st.vy += STUFFIE_GRAV * dt;
        st.x += st.vx * dt;
        st.y += st.vy * dt;
        st.c.angle += st.vx * dt * 0.4;
        if (st.x < 8 || st.x > ARENA_W - 8) st.vx *= -1;
        // Hit Leo?
        if (this._leoHitCd <= 0 && Math.abs(st.x - this._leoX) < 13 && Math.abs(st.y - this._leoY) < 14) {
          this._removeStuffie(i);
          this._damageLeo(1);
          continue;
        }
        // Land on the floor
        if (st.y >= FLOOR_BOT - 6) {
          st.y = FLOOR_BOT - 6; st.vx = 0; st.vy = 0; st.state = 'land'; st.c.setAngle(0);
          this.tweens.add({ targets: st.c, scaleX: 1.15, scaleY: 0.85, yoyo: true, duration: 120 });
        }

      } else if (st.state === 'land') {
        st.life -= delta;
        if (st.life <= 0) {
          this.tweens.add({ targets: st.c, alpha: 0, duration: 250, onComplete: () => st.c.destroy() });
          this._stuffies.splice(i, 1);
          continue;
        }
        // gentle blink when about to expire
        if (st.life < 1200) st.c.setAlpha(Math.floor(this.time.now / 150) % 2 ? 0.4 : 1);

      } else if (st.state === 'held') {
        st.x = this._leoX; st.y = this._leoY - 20 - (this._leoSprite.y < this._leoY ? (this._leoY - this._leoSprite.y) : 0);
        st.c.setPosition(st.x, st.y);
        continue;

      } else if (st.state === 'up') {
        st.x += st.vx * dt;
        st.y += st.vy * dt;
        st.c.angle += 12;
        // Hit Edie?
        if (Math.abs(st.x - this._edieX) < 20 && Math.abs(st.y - this._edieY) < 20) {
          this._removeStuffie(i);
          this._stunEdie();
          continue;
        }
        if (st.y < -20 || st.x < -20 || st.x > ARENA_W + 20) { this._removeStuffie(i); continue; }
      }

      st.c.setPosition(st.x, st.y);
    }
  }

  _removeStuffie(i) {
    const st = this._stuffies[i];
    if (this._held === st) this._held = null;
    st.c.destroy();
    this._stuffies.splice(i, 1);
  }

  _throwBack() {
    const st = this._held;
    this._held = null;
    st.state = 'up';
    const dx = this._edieX - st.x, dy = this._edieY - st.y;
    const d = Math.hypot(dx, dy) || 1;
    st.vx = (dx / d) * THROW_UP_SPEED;
    st.vy = (dy / d) * THROW_UP_SPEED;
    AudioManager.playFart(this); // little grunt/toot on the throw
    FX.popText(this, this._leoX, this._leoY - 26, 'HYAH!', { color: '#aad4ff', fontSize: '9px', rise: 18, duration: 500 });
  }

  // ── Shockwaves ───────────────────────────────────────────────────────────────
  _updateShocks(dt) {
    for (let i = this._shocks.length - 1; i >= 0; i--) {
      const s = this._shocks[i];
      s.obj.x += s.dir * SHOCK_SPEED * dt;
      s.obj.setAlpha(0.35 + Math.random() * 0.25); // crackle/flicker
      // Full-height wave: only jumping (airborne) clears it — position can't dodge
      if (this._leoHitCd <= 0 && !this._leoAirborne && Math.abs(s.obj.x - this._leoX) < 12) {
        this._damageLeo(1);
      }
      if (s.obj.x < -20 || s.obj.x > ARENA_W + 20) { s.obj.destroy(); this._shocks.splice(i, 1); }
    }
  }

  // ── Fart / throw (contextual F) ──────────────────────────────────────────────
  _handleFart(delta) {
    if (!this._fartReady) {
      this._fartCd -= delta;
      if (this._fartCd <= 0) this._fartReady = true;
    }
    if (!Phaser.Input.Keyboard.JustDown(this._fartKey)) return;

    // Holding a stuffie → throw it back instead of farting
    if (this._held) { this._throwBack(); return; }

    if (!this._fartReady) return;
    this._fartReady = false;
    this._fartCd = FART_CD;
    AudioManager.playFart(this);
    const ring = this.add.circle(this._leoX, this._leoY, 6, 0xf5e642, 0.9).setDepth(6);
    this.tweens.add({ targets: ring, displayWidth: FART_RADIUS * 2, displayHeight: FART_RADIUS * 2,
      alpha: 0, duration: 350, onComplete: () => ring.destroy() });

    if (this._edieVuln && Math.hypot(this._edieX - this._leoX, this._edieY - this._leoY) < FART_RADIUS) {
      this._hitEdie();
    }
  }

  _hitEdie() {
    AudioManager.playSfx(this, 'sfx-girly-edie', { volume: 0.9 });
    this._edieHP--;
    this._hitFlash = 500;
    this._edieBarUpdate(this._edieHP / EDIE_HP);

    FX.freeze(this, 60);
    FX.shake(this, 220, 0.012);
    FX.pop(this, this._edieSprite, 0.4);
    FX.burst(this, this._edieX, this._edieY, {
      count: 14, colors: [0xffb3e6, 0xffffff, 0xffe14d],
      minSpeed: 40, maxSpeed: 140, minSize: 1, maxSize: 4, duration: 460, depth: 30,
    });
    const lastHit = this._edieHP <= 0;
    FX.popText(this, this._edieX, this._edieY - 18, lastHit ? 'K.O.!' : 'POW!', {
      color: lastHit ? '#ff5252' : '#ffee58', fontSize: lastHit ? '14px' : '12px', rise: 30, duration: 750,
    });

    if (this._edieHP <= 0) { this._defeatEdie(); return; }
    // Knocked back up the stairs (recover), then resume from a higher phase
    this._climb();
  }

  _defeatEdie() {
    this._defeated = true;
    this._edieState = 'DEFEATED';
    this._edieVuln = false;
    this._stars.setVisible(false);
    this._hideSlamWarn();
    this._edieTint(0x555555);
    this._stuffies.forEach(st => st.c.destroy()); this._stuffies = [];
    this._shocks.forEach(s => s.obj.destroy());  this._shocks = [];

    const banner = txt(this, ARENA_W / 2, ARENA_H / 2, 'EDIE DEFEATED!', { fontSize: '16px', color: '#f5e642' })
      .setOrigin(0.5).setDepth(15);
    this.tweens.add({ targets: banner, alpha: 0.2, yoyo: true, repeat: 3, duration: 300, onComplete: () => {
      banner.destroy();
      this.time.delayedCall(600, () => {
        this.scene.get(SCENE_DIALOGUE).showScript('edie_defeated', () => {
          this.cameras.main.fade(500, 0, 0, 0);
          this.time.delayedCall(520, () => this.scene.start(SCENE_BOSS_GAUNTLET, { ...this._gauntletData, edieDefeated: true }));
        });
      });
    }});
  }

  // ── Leo damage ───────────────────────────────────────────────────────────────
  _damageLeo(amount) {
    this._leoHP = Math.max(0, this._leoHP - amount);
    this._leoHitCd = 800;
    this._leoFlash(true);
    this.time.delayedCall(200, () => { if (!this._gameover) this._leoFlash(false); });
    this.cameras.main.flash(160, 255, 60, 90);
    this._heartsUpdate(this._leoHP / 5);

    FX.shake(this, 180, 0.009);
    FX.burst(this, this._leoX, this._leoY, {
      count: 9, colors: [0xff5252, 0xff8a80, 0xffffff],
      minSpeed: 35, maxSpeed: 100, minSize: 1, maxSize: 3, duration: 420, depth: 30,
    });
    FX.popText(this, this._leoX, this._leoY - 18, `-${amount}`, { color: '#ff5252', fontSize: '9px', rise: 22, duration: 600 });

    if (this._leoHP <= 0) this._loseFight();
  }

  _loseFight() {
    this._gameover = true;
    const donuts    = this._gauntletData.donuts ?? 0;
    const stolen    = Math.ceil(donuts / 2);
    const newDonuts = donuts - stolen;
    const msg = stolen > 0
      ? `EDIE STEALS ${stolen} DONUT${stolen !== 1 ? 'S' : ''}!`
      : 'EDIE TRIES TO STEAL — BUT YOU HAD NONE LEFT!';

    const overlay = this.add.rectangle(BASE_WIDTH / 2, BASE_HEIGHT / 2, BASE_WIDTH, BASE_HEIGHT, 0x000000, 0.78).setDepth(40);
    const t1 = txt(this, BASE_WIDTH / 2, BASE_HEIGHT / 2 - 16, 'YOU LOST!', { fontSize: '12px', color: '#ff4444' }).setOrigin(0.5).setDepth(41);
    const t2 = txt(this, BASE_WIDTH / 2, BASE_HEIGHT / 2 + 4,  msg,         { fontSize: '8px',  color: '#f5a623' }).setOrigin(0.5).setDepth(41);
    const t3 = txt(this, BASE_WIDTH / 2, BASE_HEIGHT / 2 + 20, `DONUTS LEFT: ${newDonuts}`, { fontSize: '8px', color: '#aaaaaa' }).setOrigin(0.5).setDepth(41);

    this.time.delayedCall(2400, () => {
      [overlay, t1, t2, t3].forEach(o => o.destroy());
      this.cameras.main.fade(400, 0, 0, 0);
      this.time.delayedCall(420, () => this.scene.start(SCENE_CREDITS, { party: this._gauntletData.party ?? [], donuts: newDonuts }));
    });
  }

  // Leo hurt flash — image (setTint) or rectangle (setFillStyle)
  _leoFlash(on) {
    if (this._leoImg) {
      if (on) this._leoSprite.setTint(0xff5555); else this._leoSprite.clearTint();
    } else {
      this._leoSprite.setFillStyle(on ? 0xff0000 : 0x3b82f6);
    }
  }

  // ── Tint helper (image setTint / rectangle setFillStyle) ─────────────────────
  _edieTint(color) {
    if (this._edieImg) {
      if (color === null) this._edieSprite.clearTint();
      else this._edieSprite.setTint(color);
    } else {
      this._edieSprite.setFillStyle(color === null ? EDIE_COLOR : color);
    }
  }
}
