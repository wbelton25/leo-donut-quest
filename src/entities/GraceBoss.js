import { TILE_SIZE, txt } from '../constants.js';

// GraceBoss: Warren's sister. Patrols Tara Tea Dr blocking access to Warren's house.
// State machine: PATROL → CHASE → STUNNED → DEFEATED
//
// Leo defeats Grace by hitting F (lightning fart) 3 times.
// Each hit stuns her briefly. On defeat, callback fires and she disappears.

const MAX_HP        = 3;
const PATROL_SPEED  = 35;
const CHASE_SPEED   = 70;
const CHASE_RANGE   = 100;   // pixels — Grace starts chasing within this range
const STUN_DURATION = 1200;  // ms
const HIT_RANGE     = 24;    // pixels — pool noodle reach
const HIT_COOLDOWN  = 1500;  // ms between damage ticks on Leo

export default class GraceBoss {
  constructor(scene, col, row, onDefeated, onHitPlayer) {
    this._scene       = scene;
    this._onDefeated  = onDefeated;
    this._onHitPlayer = onHitPlayer;
    this._hp          = MAX_HP;
    this._state       = 'PATROL';
    this._lastHit     = 0;

    this._x = col * TILE_SIZE;
    this._y = row * TILE_SIZE + TILE_SIZE / 2;

    // Patrol bounds — covers eastern end of Tara Tea Dr
    this._patrolMinX = 140 * TILE_SIZE;
    this._patrolMaxX = 165 * TILE_SIZE;
    this._vx = PATROL_SPEED;

    // ── Visuals ───────────────────────────────────────────────────────────────
    // Body: pink rectangle
    this._body = scene.add.rectangle(this._x, this._y, TILE_SIZE * 2, TILE_SIZE * 2.5, 0xff6eb4);
    // Pool noodle (weapon): orange bar sticking out to side
    this._noodle = scene.add.rectangle(this._x + 18, this._y, TILE_SIZE * 2.5, TILE_SIZE * 0.4, 0xff8c00);
    // HP bar background
    this._hpBarBg = scene.add.rectangle(this._x, this._y - 24, TILE_SIZE * 3, 5, 0x440000);
    // HP bar fill
    this._hpBarFill = scene.add.rectangle(this._x, this._y - 24, TILE_SIZE * 3, 5, 0xff2222)
      .setOrigin(0, 0.5);
    this._hpBarFill.x = this._x - TILE_SIZE * 1.5;  // left-align

    // Name label
    this._nameLabel = txt(scene, this._x, this._y - 34, 'GRACE', {
      fontSize: '8px', color: '#ff88cc',
    }).setOrigin(0.5);

    // Exclamation on chase start
    this._alertLabel = txt(scene, this._x, this._y - 46, '!', {
      fontSize: '8px', color: '#ffff00',
    }).setOrigin(0.5).setVisible(false);
  }

  // Call from scene update — returns true if still alive
  update(player, fartJustPressed) {
    if (this._state === 'DEFEATED') return false;

    const dx = player.x - this._x;
    const dy = player.y - this._y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (this._state === 'STUNNED') {
      // Do nothing — timer handles recovery
    } else if (this._state === 'PATROL') {
      // Move back and forth
      this._x += this._vx * (1 / 60);
      if (this._x < this._patrolMinX || this._x > this._patrolMaxX) {
        this._vx *= -1;
        this._x = Phaser.Math.Clamp(this._x, this._patrolMinX, this._patrolMaxX);
      }
      // Switch to chase if player gets close
      if (dist < CHASE_RANGE) {
        this._state = 'CHASE';
        this._alertLabel.setVisible(true);
        this._scene.time.delayedCall(600, () => this._alertLabel.setVisible(false));
      }
    } else if (this._state === 'CHASE') {
      // Move toward player
      if (dist > 4) {
        const nx = dx / dist, ny = dy / dist;
        this._x += nx * CHASE_SPEED * (1 / 60);
        this._y += ny * CHASE_SPEED * (1 / 60);
      }
      // Return to patrol if player gets far away
      if (dist > CHASE_RANGE * 1.5) {
        this._state = 'PATROL';
      }
    }

    // Grace hits Leo with pool noodle when close in CHASE state
    if (this._state === 'CHASE' && dist < HIT_RANGE) {
      const now = Date.now();
      if (now - this._lastHit > HIT_COOLDOWN) {
        this._lastHit = now;
        if (this._onHitPlayer) this._onHitPlayer();
        // Visual feedback — noodle flash orange
        this._noodle.setFillStyle(0xffffff);
        this._scene.time.delayedCall(120, () => this._noodle.setFillStyle(0xff8c00));
      }
    }

    // Check fart hit — must be close
    if (fartJustPressed && dist < 72) {
      this._hit();
    }

    this._syncVisuals();
    return true;
  }

  _hit() {
    if (this._state === 'STUNNED' || this._state === 'DEFEATED') return;
    this._hp--;
    this._state = 'STUNNED';
    this._body.setFillStyle(0xffffff);  // flash white

    // Stun flash then recover
    this._scene.time.delayedCall(150, () => this._body.setFillStyle(0xff6eb4));
    this._scene.time.delayedCall(STUN_DURATION, () => {
      if (this._state !== 'DEFEATED') {
        this._state = this._hp > 0 ? 'PATROL' : 'DEFEATED';
        if (this._state === 'DEFEATED') this._defeat();
      }
    });

    this._updateHpBar();
  }

  _defeat() {
    // Spin-out animation then disappear
    this._scene.tweens.add({
      targets: [this._body, this._noodle],
      alpha: 0,
      angle: 360,
      duration: 600,
      onComplete: () => {
        this.destroy();
        this._onDefeated();
      },
    });
    this._hpBarBg.destroy();
    this._hpBarFill.destroy();
    this._nameLabel.destroy();
    this._alertLabel.destroy();
  }

  _updateHpBar() {
    const pct = this._hp / MAX_HP;
    this._hpBarFill.setDisplaySize(TILE_SIZE * 3 * pct, 5);
    this._hpBarFill.setFillStyle(pct > 0.5 ? 0xff2222 : 0xff8800);
  }

  _syncVisuals() {
    this._body.setPosition(this._x, this._y);
    const noodleOffX = this._vx >= 0 ? 18 : -18;
    this._noodle.setPosition(this._x + noodleOffX, this._y);
    this._hpBarBg.setPosition(this._x, this._y - 24);
    this._hpBarFill.x = this._x - TILE_SIZE * 1.5;
    this._hpBarFill.y = this._y - 24;
    this._nameLabel.setPosition(this._x, this._y - 34);
    this._alertLabel.setPosition(this._x, this._y - 46);
  }

  destroy() {
    this._body.destroy();
    this._noodle.destroy();
    if (this._hpBarBg.active)   this._hpBarBg.destroy();
    if (this._hpBarFill.active) this._hpBarFill.destroy();
    if (this._nameLabel.active) this._nameLabel.destroy();
    if (this._alertLabel.active) this._alertLabel.destroy();
  }
}
