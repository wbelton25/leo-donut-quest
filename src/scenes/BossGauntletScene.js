import {
  SCENE_BOSS_GAUNTLET, SCENE_DIALOGUE, SCENE_CREDITS, SCENE_REPORT_CARD,
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

// Fixed return-home fight order by where the siblings live (not party join order):
// Nora (carson) → Justin's Max (justin) → Max (mj) → Grace (warren), then Edie last.
const BOSS_ORDER = ['carson', 'justin', 'mj', 'warren'];

// Human-readable names for the pre-fight announcement
const SIBLING_NAMES = {
  warren: 'GRACE',
  mj:     'MAX',
  carson: 'NORA',
  justin: 'MAX',
};

// Dialogue scripts to show before each gauntlet fight
const SIBLING_INTRO_SCRIPTS = {
  warren: 'gauntlet_grace',
  mj:     'gauntlet_max_football',
  carson: 'gauntlet_nora',
  justin: 'gauntlet_max_baseball',
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

    // Act 3 starts fresh at full energy, then PERSISTS across sibling fights so that
    // spending donuts to recharge matters. Only reset on the very first fight.
    if (defeatedBosses.length === 0 && !edieDefeated) {
      const res = this.game.registry.get('resources');
      if (res) res.applyChanges({ energy: 100 - res.energy });
    }

    // ── If Edie is defeated → game complete ───────────────────────────────────
    if (edieDefeated) {
      this._winGame();
      return;
    }

    // ── Build the queue of remaining fights ───────────────────────────────────
    // Siblings of surviving party members that haven't been beaten yet
    const queue = BOSS_ORDER
      .filter(id => party.includes(id) && SIBLING_SCENES[id] && !defeatedBosses.includes(id))
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

    // Show taunt dialogue then transition to boss fight
    const introScript = SIBLING_INTRO_SCRIPTS[nextFight.id];
    const launchFight = () => {
      this.cameras.main.fade(400, 0, 0, 0);
      this.time.delayedCall(420, () => {
        this.scene.start(nextFight.scene, {
          gauntlet: true,
          gauntletData: {
            party,
            donuts:         this._data.donuts ?? 0,
            resources:      this._data.resources ?? {},
            defeatedBosses: newDefeated,
          },
        });
      });
    };

    if (introScript) {
      this.time.delayedCall(1800, () => {
        this.scene.get(SCENE_DIALOGUE).showScript(introScript, launchFight);
      });
    } else {
      this.time.delayedCall(2500, launchFight);
    }
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

    const launchEdie = () => {
      this.cameras.main.fade(400, 0, 0, 0);
      this.time.delayedCall(420, () => {
        this.scene.start(SCENE_EDIE_BOSS, {
          gauntlet:       true,
          gauntletData:   { ...this._data },
          party:          this._data.party ?? [],
          donuts:         this._data.donuts ?? 0,
          resources:      this._data.resources ?? {},
          defeatedBosses: this._data.defeatedBosses ?? [],
        });
      });
    };

    this.time.delayedCall(1800, () => {
      this.scene.get(SCENE_DIALOGUE).showScript('gauntlet_edie', launchEdie);
    });
  }

  _winGame() {
    this.cameras.main.fade(400, 0, 0, 0);
    this.time.delayedCall(420, () => {
      this.scene.start(SCENE_REPORT_CARD, {
        party:     this._data.party ?? [],
        donuts:    this._data.donuts ?? 0,
        resources: this._data.resources ?? {},
      });
    });
  }
}
