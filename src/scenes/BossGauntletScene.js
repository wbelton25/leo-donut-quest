import {
  SCENE_BOSS_GAUNTLET, SCENE_DIALOGUE, SCENE_CREDITS,
  SCENE_GRACE_BOSS, SCENE_MAX_BOSS, SCENE_NORA_BOSS, SCENE_JUSTIN_MAX_BOSS, SCENE_EDIE_BOSS,
  BASE_WIDTH, BASE_HEIGHT, txt,
} from '../constants.js';

// BossGauntletScene: sequences the return-home boss fights.
// Fights siblings of surviving party members (in party order), then always Edie last.
// Receives { party, donuts, resources, defeatedBosses: [] } from ReturnJourneyScene / bosses.

// Map from party member ID → their sibling's boss scene key
const SIBLING_SCENES = {
  warren: SCENE_GRACE_BOSS,
  mj:     SCENE_MAX_BOSS,
  carson: SCENE_NORA_BOSS,
  justin: SCENE_JUSTIN_MAX_BOSS,
};

// Human-readable names for the pre-fight announcement
const SIBLING_NAMES = {
  warren: 'GRACE',
  mj:     'MAX',
  carson: 'NORA',
  justin: 'MAX (BASEBALL)',
};

export default class BossGauntletScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_BOSS_GAUNTLET });
  }

  init(data) {
    this._data = data ?? {};
  }

  create() {
    const party          = this._data.party ?? [];
    const defeatedBosses = this._data.defeatedBosses ?? [];
    const edieDefeated   = this._data.edieDefeated ?? false;

    // ── If Edie is defeated → game complete ───────────────────────────────────
    if (edieDefeated) {
      this._winGame();
      return;
    }

    // ── Build the queue of remaining fights ───────────────────────────────────
    // Siblings of surviving party members that haven't been beaten yet
    const queue = party
      .filter(id => SIBLING_SCENES[id] && !defeatedBosses.includes(id))
      .map(id => ({ id, scene: SIBLING_SCENES[id], name: SIBLING_NAMES[id] }));

    // If no sibling fights remain, go straight to Edie
    if (queue.length === 0) {
      this._fightEdie();
      return;
    }

    const nextFight = queue[0];
    const newDefeated = [...defeatedBosses, nextFight.id];

    // ── Announcement screen ───────────────────────────────────────────────────
    this.add.rectangle(BASE_WIDTH / 2, BASE_HEIGHT / 2, BASE_WIDTH, BASE_HEIGHT, 0x0a0a1a);

    txt(this, BASE_WIDTH / 2, BASE_HEIGHT / 2 - 40, 'INCOMING!', {
      fontSize: '16px', color: '#ff3333',
    }).setOrigin(0.5);

    txt(this, BASE_WIDTH / 2, BASE_HEIGHT / 2, nextFight.name, {
      fontSize: '16px', color: '#f5e642',
    }).setOrigin(0.5);

    txt(this, BASE_WIDTH / 2, BASE_HEIGHT / 2 + 30,
      `WANTS YOUR DONUTS`, { fontSize: '8px', color: '#ff8888' }).setOrigin(0.5);

    // Show remaining fights
    const remaining = queue.length;
    txt(this, BASE_WIDTH / 2, BASE_HEIGHT / 2 + 50,
      `${remaining} FIGHT${remaining > 1 ? 'S' : ''} LEFT  (+EDIE)`,
      { fontSize: '8px', color: '#556677' }).setOrigin(0.5);

    // Auto-transition to boss scene after 2.5s
    this.time.delayedCall(2500, () => {
      this.cameras.main.fade(400, 0, 0, 0);
      this.time.delayedCall(420, () => {
        this.scene.start(nextFight.scene, {
          gauntlet: true,
          gauntletData: {
            party,
            donuts:        this._data.donuts ?? 0,
            resources:     this._data.resources ?? {},
            defeatedBosses: newDefeated,
          },
        });
      });
    });
  }

  _fightEdie() {
    this.add.rectangle(BASE_WIDTH / 2, BASE_HEIGHT / 2, BASE_WIDTH, BASE_HEIGHT, 0x0a0a1a);

    txt(this, BASE_WIDTH / 2, BASE_HEIGHT / 2 - 40, 'FINAL BOSS!', {
      fontSize: '16px', color: '#ff69b4',
    }).setOrigin(0.5);

    txt(this, BASE_WIDTH / 2, BASE_HEIGHT / 2, 'EDIE', {
      fontSize: '16px', color: '#f5e642',
    }).setOrigin(0.5);

    txt(this, BASE_WIDTH / 2, BASE_HEIGHT / 2 + 30,
      "LEO'S SISTER WANTS THE DONUTS",
      { fontSize: '8px', color: '#ff88cc' }).setOrigin(0.5);

    this.time.delayedCall(2500, () => {
      this.cameras.main.fade(400, 0, 0, 0);
      this.time.delayedCall(420, () => {
        this.scene.start(SCENE_EDIE_BOSS, {
          gauntlet: true,
          gauntletData: { ...this._data },
          party:    this._data.party ?? [],
          donuts:   this._data.donuts ?? 0,
          resources: this._data.resources ?? {},
          defeatedBosses: this._data.defeatedBosses ?? [],
        });
      });
    });
  }

  _winGame() {
    this.cameras.main.fade(400, 0, 0, 0);
    this.time.delayedCall(420, () => {
      this.scene.start(SCENE_CREDITS, {
        party:  this._data.party ?? [],
        donuts: this._data.donuts ?? 0,
      });
    });
  }
}
