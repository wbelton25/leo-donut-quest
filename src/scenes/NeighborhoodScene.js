import { SCENE_NEIGHBORHOOD, SCENE_DIALOGUE, BASE_WIDTH, BASE_HEIGHT, TILE_SIZE, txt } from '../constants.js';
import Player from '../entities/Player.js';
import ResourceSystem from '../systems/ResourceSystem.js';
import PartySystem from '../systems/PartySystem.js';
import AbilitySystem from '../systems/AbilitySystem.js';
import SaveSystem from '../systems/SaveSystem.js';

// NeighborhoodScene: the open-world hub for Act 1.
// Phase 1: placeholder tile grid + player movement + camera.
// Phase 2: systems initialized here, dialogue tested.
// Phase 3: replace with real Tiled tilemap and friend house interactables.

export default class NeighborhoodScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_NEIGHBORHOOD });
  }

  create() {
    // ── Initialize core systems ───────────────────────────────────────────────
    // Systems are created here and stored on game.registry so other scenes
    // can retrieve them without tight coupling.
    this._resources = new ResourceSystem(this.game);
    this._party     = new PartySystem(this.game);
    this._abilities = new AbilitySystem(this.game, this._party);

    // Restore state if continuing a saved game
    const gameState = this.game.registry.get('gameState');
    if (gameState) {
      this._resources.restoreFromSave(gameState.resources);
      this._party.restoreFromSave(gameState);
    }

    // Store systems on registry so BossScene, OregonTrailScene etc. can access them
    this.game.registry.set('resources', this._resources);
    this.game.registry.set('party',     this._party);
    this.game.registry.set('abilities', this._abilities);

    // Register Leo's Lightning Fart ability handler
    this._abilities.register('lightning_fart', (scene, player) => {
      this._fireLightningFart(scene, player);
    });

    // ── Placeholder world ─────────────────────────────────────────────────────
    const MAP_COLS = 40;
    const MAP_ROWS = 30;
    const worldWidth  = MAP_COLS * TILE_SIZE;
    const worldHeight = MAP_ROWS * TILE_SIZE;

    // Checkerboard grass ground
    for (let row = 0; row < MAP_ROWS; row++) {
      for (let col = 0; col < MAP_COLS; col++) {
        const color = (row + col) % 2 === 0 ? 0x2d5a1b : 0x336b20;
        this.add.rectangle(
          col * TILE_SIZE + TILE_SIZE / 2,
          row * TILE_SIZE + TILE_SIZE / 2,
          TILE_SIZE - 1, TILE_SIZE - 1, color
        );
      }
    }

    // Road strips drawn after ground tiles so they appear on top (no depth override needed)
    this.add.rectangle(worldWidth / 2, 9 * TILE_SIZE, worldWidth, 2 * TILE_SIZE, 0x555555);
    this.add.rectangle(20 * TILE_SIZE, worldHeight / 2, 2 * TILE_SIZE, worldHeight, 0x555555);

    // ── Static walls ──────────────────────────────────────────────────────────
    this._walls = this.physics.add.staticGroup();
    const wallDefs = [
      [0, 0, MAP_COLS, 1],            // top border
      [0, MAP_ROWS - 1, MAP_COLS, 1], // bottom border
      [0, 0, 1, MAP_ROWS],            // left border
      [MAP_COLS - 1, 0, 1, MAP_ROWS], // right border
      [3, 20, 5, 4],   // Leo's house
      [5, 3, 4, 3],    // Warren's house placeholder (northeast)
      [28, 5, 4, 3],   // MJ's house placeholder
      [8, 24, 4, 3],   // Carsen's house placeholder
      [30, 18, 4, 3],  // Justin's house placeholder
    ];

    wallDefs.forEach(([col, row, w, h]) => {
      const rect = this.add.rectangle(
        col * TILE_SIZE + (w * TILE_SIZE) / 2,
        row * TILE_SIZE + (h * TILE_SIZE) / 2,
        w * TILE_SIZE, h * TILE_SIZE, 0x8b7355
      );
      this.physics.add.existing(rect, true);
      this._walls.add(rect);
    });

    // House labels
    const labels = [
      [3, 20, "LEO'S HOUSE"], [5, 3, "WARREN"],
      [28, 5, "MJ"], [8, 24, "CARSEN"], [30, 18, "JUSTIN"],
    ];
    labels.forEach(([col, row, name]) => {
      txt(this, col * TILE_SIZE + 2, row * TILE_SIZE - 7, name, {
        fontSize: '5px', color: '#ffff88',
      });
    });

    // ── Player ────────────────────────────────────────────────────────────────
    this._player = new Player(this, 5 * TILE_SIZE, 23 * TILE_SIZE);
    this.physics.add.collider(this._player, this._walls);

    // ── Ability key bindings ──────────────────────────────────────────────────
    this._fartKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);

    // ── Camera ────────────────────────────────────────────────────────────────
    this.cameras.main.setBounds(0, 0, worldWidth, worldHeight);
    this.cameras.main.startFollow(this._player, true, 0.1, 0.1);
    this.cameras.main.setDeadzone(40, 30);

    // ── Phase 2 test: press D to test dialogue, E to test a random event ──────
    const dKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    dKey.once('down', () => {
      const dialogueScene = this.scene.get(SCENE_DIALOGUE);
      dialogueScene.showScript('intro', () => {
        console.log('[Phase2Test] Intro dialogue complete.');
      });
    });

    txt(this, 4, 21, 'ACT 1 - NEIGHBORHOOD', {
      fontSize: '6px', color: '#ffffff',
    }).setScrollFactor(0);

    txt(this, 4, 31, 'MOVE:WASD  FART:F  TALK:D', {
      fontSize: '5px', color: '#aaaaaa',
    }).setScrollFactor(0);

    // Emit initial resource/party state so HUD populates on load
    this._resources.applyChanges({});
    this._party._emit();
  }

  update() {
    this._player.update();

    // F key fires Lightning Fart
    if (Phaser.Input.Keyboard.JustDown(this._fartKey)) {
      this._abilities.execute('lightning_fart', this, this._player);
    }

    // Autosave checkpoint every 30 seconds
    if (!this._lastSave || Date.now() - this._lastSave > 30000) {
      this._autosave();
      this._lastSave = Date.now();
    }
  }

  _fireLightningFart(scene, player) {
    // Visual: expanding ring from the player's position
    const ring = scene.add.circle(player.x, player.y, 5, 0xf5e642, 0.8);
    scene.tweens.add({
      targets: ring,
      radius: 40,
      alpha: 0,
      duration: 400,
      onComplete: () => ring.destroy(),
    });
    // In Phase 4 this will also damage bosses in range
    console.log('[Ability] Lightning Fart!');
  }

  _autosave() {
    const gameState = this.game.registry.get('gameState') ?? {};
    gameState.resources = this._resources.getAll();
    const partyState = this._party.getState();
    gameState.party = partyState.party;
    gameState.lostMembers = partyState.lostMembers;
    SaveSystem.save(gameState);
  }
}
