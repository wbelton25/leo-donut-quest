import Phaser from 'phaser';

// FallingItem — one thing tumbling down the screen in Donut Rain.
//
// Everything is drawn from Phaser primitives (the same shape vocabulary as the
// adventure's DonutHolePickup / GoldenDonutPickup), so there are no textures to
// load and nothing can 404. Each kind falls with its own "character": golf balls
// spin and wobble, deer drift side to side, cars streak straight down fast.
//
// The director sets a base fall speed (rising with difficulty); each kind scales
// it. Collision is a plain circle test against Leo (see DonutRainScene), so every
// item exposes .x / .y / .r.

// kind → { good, points, r (hit radius), speed (× base), pattern, draw }
const KINDS = {
  // ── Good: catch these ─────────────────────────────────────────────────────
  hole:    { good: true,  points: 5,   r: 7,  speed: 1.0,  pattern: 'straight', draw: drawHole },
  donut:   { good: true,  points: 15,  r: 10, speed: 0.9,  pattern: 'straight', draw: drawDonut },
  golden:  { good: true,  points: 50,  r: 11, speed: 1.15, pattern: 'wobble',   draw: drawGolden },
  // ── Bad: dodge these ──────────────────────────────────────────────────────
  pothole: { good: false, r: 11, speed: 1.05, pattern: 'straight', draw: drawPothole },
  golfball:{ good: false, r: 7,  speed: 1.2,  pattern: 'wobble',   draw: drawGolfball },
  deer:    { good: false, r: 13, speed: 0.8,  pattern: 'drift',    draw: drawDeer },
  car:     { good: false, r: 16, speed: 1.55, pattern: 'straight', draw: drawCar },
  // ── Boss weapons (rained during a boss invasion) ──────────────────────────
  noodle:    { good: false, r: 12, speed: 0.95, pattern: 'wobble',   draw: drawNoodle },   // Grace
  soccerball:{ good: false, r: 9,  speed: 1.1,  pattern: 'drift',    draw: drawSoccer },   // Nora
  football:  { good: false, r: 10, speed: 1.45, pattern: 'straight', draw: drawFootball }, // Max
  baseball:  { good: false, r: 7,  speed: 1.2,  pattern: 'wobble',   draw: drawBaseball }, // Justin & Max
  stuffie:   { good: false, r: 11, speed: 0.9,  pattern: 'drift',    draw: drawStuffie },  // Edie
  // ── Friend faces — catch the right one before their sibling boss ───────────
  'friend-warren': { good: true, points: 20, r: 14, speed: 0.8, pattern: 'straight', draw: drawFriend('head-warren'), friend: 'warren' },
  'friend-mj':     { good: true, points: 20, r: 14, speed: 0.8, pattern: 'straight', draw: drawFriend('head-mj'),     friend: 'mj' },
  'friend-carson': { good: true, points: 20, r: 14, speed: 0.8, pattern: 'straight', draw: drawFriend('head-carson'), friend: 'carson' },
  'friend-justin': { good: true, points: 20, r: 14, speed: 0.8, pattern: 'straight', draw: drawFriend('head-justin'), friend: 'justin' },
};

export const GOOD_KINDS = ['hole', 'donut', 'golden'];
export const BAD_KINDS  = ['pothole', 'golfball', 'deer', 'car'];
export const friendKind = (id) => `friend-${id}`;

export default class FallingItem {
  constructor(scene, x, y, kind, baseSpeed) {
    const cfg = KINDS[kind];
    this.scene   = scene;
    this.kind    = kind;
    this.good    = cfg.good;
    this.points  = cfg.points || 0;
    this.r       = cfg.r;
    this.pattern = cfg.pattern;
    this.friendId = cfg.friend || null;
    this.collected = false;
    this.dead    = false;

    this._vy    = baseSpeed * cfg.speed;
    this._t     = 0;
    this._phase = Math.random() * Math.PI * 2; // desync wobble/drift across items
    this._spin  = Phaser.Math.Between(-6, 6);  // deg/frame visual roll
    this._homeX = x;

    this.container = scene.add.container(x, y).setDepth(5);
    cfg.draw(scene, this.container);
    this.x = x;
    this.y = y;
  }

  // Advance one frame. dt in seconds. `killY` is the line at Leo's level below
  // which an uncaught item is done (missed) — removing it there keeps the ground
  // scenery clear instead of letting debris rain down over it. Returns false once
  // the item has passed that line.
  update(dt, killY) {
    this._t += dt;
    this.y += this._vy * dt;

    if (this.pattern === 'wobble') {
      this.x = this._homeX + Math.sin(this._t * 6 + this._phase) * 34;
      this.container.angle += this._spin;
    } else if (this.pattern === 'drift') {
      this.x = this._homeX + Math.sin(this._t * 2.2 + this._phase) * 70;
    }

    this.container.x = this.x;
    this.container.y = this.y;

    if (this.y > killY) { this.destroy(); return false; }
    return true;
  }

  destroy() {
    if (this.dead) return; // idempotent — catch/hit and game-over cleanup can overlap
    this.dead = true;
    this.container?.destroy();
  }
}

// ── Drawings (centered on the container origin) ───────────────────────────────

// Glazed "munchkin" — copied from DonutHolePickup so it reads identically.
function drawHole(scene, c) {
  c.add(scene.add.circle(0, 0, 6, 0xc9812f).setStrokeStyle(1, 0x8a5620));
  c.add(scene.add.circle(-1.6, -1.6, 2.8, 0xe6a856));
  c.add(scene.add.circle(-2, -2, 1.1, 0xf7d9a0));
  c.add(scene.add.circle(2.4, 1.8, 0.8, 0xfff2d8));
}

// A pink-frosted ring donut with sprinkles.
function drawDonut(scene, c) {
  c.add(scene.add.circle(0, 0, 9, 0xd98a4a));                       // dough ring outer
  c.add(scene.add.circle(0, 0, 9, 0xff9ec4).setScale(0.98));        // pink frosting
  c.add(scene.add.circle(0, 0, 3.4, 0x8ec7ff));                     // hole (shows sky)
  c.add(scene.add.rectangle(-3, -3, 3, 1.4, 0xffffff).setAngle(35));
  c.add(scene.add.rectangle(3, -1, 3, 1.4, 0x7ce0a0).setAngle(-20));
  c.add(scene.add.rectangle(-1, 4, 3, 1.4, 0xffe07a).setAngle(60));
}

// Golden donut — flashy, from GoldenDonutPickup.
function drawGolden(scene, c) {
  c.add(scene.add.circle(0, 0, 12, 0xffe86a, 0.30));                // glow
  c.add(scene.add.circle(0, 0, 8, 0xffd23f).setStrokeStyle(2, 0xffb300));
  c.add(scene.add.circle(0, 0, 3, 0x8a5a00));
  c.add(scene.add.rectangle(-3, -2, 3, 1.5, 0xffffff).setAngle(30));
  c.add(scene.add.rectangle(3, 2, 3, 1.5, 0xfff0b0).setAngle(-40));
}

// Pothole — a ragged dark patch of broken asphalt.
function drawPothole(scene, c) {
  c.add(scene.add.ellipse(0, 0, 22, 16, 0x2b2b30));
  c.add(scene.add.ellipse(0, 0, 14, 9, 0x141417));
  c.add(scene.add.circle(-4, 2, 1.6, 0x45454d));
  c.add(scene.add.circle(5, -2, 1.2, 0x45454d));
}

// Golf ball — white with a couple of dimples so the spin reads.
function drawGolfball(scene, c) {
  c.add(scene.add.circle(0, 0, 6.5, 0xffffff).setStrokeStyle(1, 0xbfc6cc));
  c.add(scene.add.circle(-2, -1, 0.9, 0xd7dde2));
  c.add(scene.add.circle(1.5, 1.5, 0.9, 0xd7dde2));
  c.add(scene.add.circle(2.5, -2, 0.9, 0xd7dde2));
}

// Deer — a front-facing deer face with antlers. Antlers + big ears are the most
// recognizable deer cues at this small size, so lead with those.
function drawDeer(scene, c) {
  const antler = 0xb08d57, fur = 0x9c6a40, furDark = 0x7a4e2c, muzzle = 0xc79a6d;
  // Branched antlers (behind the head), mirrored left/right.
  for (const s of [-1, 1]) {
    c.add(scene.add.rectangle(3 * s, -12, 2.2, 13, antler).setAngle(16 * s)); // main beam
    c.add(scene.add.rectangle(6 * s, -17, 2.2, 7, antler).setAngle(48 * s));  // outer tine
    c.add(scene.add.rectangle(1 * s, -18, 2.2, 6, antler).setAngle(-8 * s));  // inner tine
  }
  // Ears
  c.add(scene.add.ellipse(-8, -3, 7, 11, furDark).setAngle(-28));
  c.add(scene.add.ellipse(8, -3, 7, 11, furDark).setAngle(28));
  c.add(scene.add.ellipse(-8, -3, 3.2, 6, muzzle).setAngle(-28)); // inner ear
  c.add(scene.add.ellipse(8, -3, 3.2, 6, muzzle).setAngle(28));
  // Head + muzzle
  c.add(scene.add.ellipse(0, 1, 15, 18, fur));
  c.add(scene.add.ellipse(0, 7, 9, 9, muzzle));
  // Eyes + nose
  c.add(scene.add.circle(-4.5, -1, 1.8, 0x1a1a1a));
  c.add(scene.add.circle(4.5, -1, 1.8, 0x1a1a1a));
  c.add(scene.add.circle(-4.5, -1.6, 0.6, 0xffffff)); // eye glint
  c.add(scene.add.circle(4.5, -1.6, 0.6, 0xffffff));
  c.add(scene.add.ellipse(0, 8.5, 4.5, 3, 0x2a1a12)); // nose
}

// ── Boss weapons — use the real sprite when loaded, else a drawn stand-in ─────
function spriteOr(scene, c, key, w, h, fallback) {
  if (scene.textures.exists(key)) c.add(scene.add.image(0, 0, key).setDisplaySize(w, h));
  else fallback(scene, c);
}

// Friend face pickup — the headshot inside a bright ring so it clearly reads as a
// special "grab me!" item, not another donut.
function drawFriend(headKey) {
  return (scene, c) => {
    c.add(scene.add.circle(0, 0, 15, 0xffe86a, 0.35));                 // glow
    if (scene.textures.exists(headKey)) {
      c.add(scene.add.image(0, 0, headKey).setDisplaySize(24, 24));
    } else {
      c.add(scene.add.circle(0, 0, 11, 0x66ccff).setStrokeStyle(2, 0xffffff));
    }
    c.add(scene.add.circle(0, 0, 15, 0x000000, 0).setStrokeStyle(2, 0xffe86a)); // ring
  };
}

// Grace — pool noodle (tumbles end over end).
function drawNoodle(scene, c) {
  spriteOr(scene, c, 'sprite-pool-noodle', 30, 11, (s, cc) => {
    cc.add(s.add.rectangle(0, 0, 28, 9, 0x4db8f0).setStrokeStyle(1, 0x2a90c0));
    cc.add(s.add.rectangle(0, -1, 28, 2.5, 0xbfe9ff));
  });
}

// Nora — soccer ball.
function drawSoccer(scene, c) {
  spriteOr(scene, c, 'sprite-soccer-ball', 16, 16, (s, cc) => {
    cc.add(s.add.circle(0, 0, 8, 0xffffff).setStrokeStyle(1, 0x333333));
    cc.add(s.add.circle(0, 0, 2.6, 0x222222));
  });
}

// Max — football (thrown in a spiral).
function drawFootball(scene, c) {
  spriteOr(scene, c, 'sprite-football', 18, 12, (s, cc) => {
    cc.add(s.add.ellipse(0, 0, 18, 11, 0x8a4b2a).setStrokeStyle(1, 0x5a2f18));
    cc.add(s.add.rectangle(0, 0, 6, 1.5, 0xffffff));
  });
}

// Justin & Max — baseball (curveball wobble).
function drawBaseball(scene, c) {
  spriteOr(scene, c, 'sprite-baseball', 14, 14, (s, cc) => {
    cc.add(s.add.circle(0, 0, 7, 0xffffff).setStrokeStyle(1, 0xcc4444));
  });
}

// Edie — a thrown stuffie (teddy bear), tumbling down.
function drawStuffie(scene, c) {
  c.add(scene.add.circle(0, 3, 8, 0xb07a45));      // body
  c.add(scene.add.circle(0, -6, 5, 0xc68a52));     // head
  c.add(scene.add.circle(-4, -10, 2.6, 0x9c6a40)); // ear
  c.add(scene.add.circle(4, -10, 2.6, 0x9c6a40));  // ear
  c.add(scene.add.circle(-2, -6, 1, 0x000000));    // eye
  c.add(scene.add.circle(2, -6, 1, 0x000000));     // eye
  c.add(scene.add.circle(0, -4, 1.3, 0x5a3a20));   // snout
  c.add(scene.add.circle(0, 3, 3, 0xc99a68));      // belly
}

// Car — a colored hatchback seen from above.
function drawCar(scene, c) {
  const body = Phaser.Utils.Array.GetRandom([0xd94f4f, 0x4f7fd9, 0x53b06a, 0xcccccc]);
  c.add(scene.add.rectangle(0, 0, 20, 30, body).setStrokeStyle(1, 0x222222)); // body
  c.add(scene.add.rectangle(0, -6, 14, 8, 0x9fd8ff));  // windshield
  c.add(scene.add.rectangle(0, 7, 14, 7, 0x2a3340));   // rear window
  c.add(scene.add.rectangle(-11, -9, 2, 6, 0x111111)); // wheels
  c.add(scene.add.rectangle(11, -9, 2, 6, 0x111111));
  c.add(scene.add.rectangle(-11, 9, 2, 6, 0x111111));
  c.add(scene.add.rectangle(11, 9, 2, 6, 0x111111));
}
