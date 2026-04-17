import {
  SCENE_TITLE, SCENE_NEIGHBORHOOD, SCENE_HUD, SCENE_DIALOGUE,
  BASE_WIDTH, BASE_HEIGHT, txt,
} from '../constants.js';
import SaveSystem from '../systems/SaveSystem.js';
import ScoreSystem from '../systems/ScoreSystem.js';

export default class TitleScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_TITLE });
  }

  create() {
    const cx = BASE_WIDTH / 2;
    const cy = BASE_HEIGHT / 2;

    this.add.rectangle(0, 0, BASE_WIDTH, BASE_HEIGHT, 0x1a1a2e).setOrigin(0, 0);

    // Donut graphic
    this.add.circle(cx - 60, cy - 55, 30, 0xf5a623);
    this.add.circle(cx - 60, cy - 55, 12, 0x1a1a2e);
    [[-8, -8], [10, -12], [-12, 5], [8, 10], [0, -16]].forEach(([dx, dy]) => {
      this.add.rectangle(cx - 60 + dx, cy - 55 + dy, 4, 2, 0xe74c3c)
        .setAngle(Math.random() * 90 - 45);
    });

    // Title
    txt(this, cx - 60, cy - 18, "LEO'S DONUT QUEST", {
      fontSize: '10px', color: '#f5a623', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5);
    txt(this, cx - 60, cy - 2, 'A SUBURBAN ADVENTURE', {
      fontSize: '6px', color: '#aaaaaa',
    }).setOrigin(0.5);
    txt(this, cx - 60, cy + 12, 'TEGA CAY, SC', {
      fontSize: '6px', color: '#667788',
    }).setOrigin(0.5);

    // Buttons
    this._addButton(cx - 60, cy + 32, 'START GAME', () => this._startNewGame());

    const prompt = txt(this, cx - 60, cy + 52, 'PRESS ANY KEY', {
      fontSize: '6px', color: '#555577',
    }).setOrigin(0.5);
    this.time.addEvent({ delay: 600, loop: true, callback: () => prompt.setVisible(!prompt.visible) });

    txt(this, BASE_WIDTH - 4, BASE_HEIGHT - 6, 'v0.5', {
      fontSize: '6px', color: '#334455',
    }).setOrigin(1, 1);

    // ── Leaderboard panel (right side) ────────────────────────────────────────
    this._buildLeaderboard();
  }

  _buildLeaderboard() {
    const board = ScoreSystem.getLeaderboard();
    const panelX = BASE_WIDTH - 156;
    const panelY = 14;
    const panelW = 148;
    const panelH = BASE_HEIGHT - 28;

    // Panel background
    this.add.rectangle(panelX + panelW / 2, panelY + panelH / 2, panelW, panelH, 0x080810, 0.92)
      .setStrokeStyle(1, 0x2a3a4a);

    txt(this, panelX + panelW / 2, panelY + 9, 'HIGH SCORES', {
      fontSize: '8px', color: '#f5a623',
    }).setOrigin(0.5);

    this.add.rectangle(panelX + panelW / 2, panelY + 22, panelW - 8, 1, 0x2a3a4a);

    if (board.length === 0) {
      txt(this, panelX + panelW / 2, panelY + panelH / 2, 'NO SCORES YET', {
        fontSize: '8px', color: '#445566', align: 'center',
      }).setOrigin(0.5);
      txt(this, panelX + panelW / 2, panelY + panelH / 2 + 14, 'Play to get on\nthe board!', {
        fontSize: '8px', color: '#334455', align: 'center',
      }).setOrigin(0.5);
    } else {
      const rankColors = ['#ffdd00', '#bbbbbb', '#cc8844', '#888888', '#667788'];

      board.forEach((entry, i) => {
        const rowY = panelY + 30 + i * 38;
        const rc   = rankColors[i] ?? '#667788';
        const ini  = entry.initials ?? '???';

        // Row divider (except first)
        if (i > 0) this.add.rectangle(panelX + panelW / 2, rowY - 4, panelW - 12, 1, 0x1a2a3a);

        // #N  INITIALS  SCORE
        txt(this, panelX + 10, rowY,     `#${i + 1}`, { fontSize: '8px', color: rc });
        txt(this, panelX + 30, rowY,     ini,          { fontSize: '8px', color: '#ffffff' });
        txt(this, panelX + panelW - 8, rowY, `${entry.score} PTS`, {
          fontSize: '8px', color: '#f5e642',
        }).setOrigin(1, 0);

        // DON:N CRW:N  date  (two separate aligned items)
        txt(this, panelX + 10, rowY + 14,
          `D:${entry.donuts} C:${entry.partySize}`,
          { fontSize: '8px', color: '#556677' });
        txt(this, panelX + panelW - 8, rowY + 14, entry.date, {
          fontSize: '8px', color: '#445566',
        }).setOrigin(1, 0);
      });

      // Clear scores button
      const clearY = panelY + panelH - 14;
      const clearBg = this.add.rectangle(panelX + panelW / 2, clearY, 100, 14, 0x1a1a2a)
        .setInteractive({ useHandCursor: true });
      const clearLbl = txt(this, panelX + panelW / 2, clearY, 'CLEAR SCORES', {
        fontSize: '8px', color: '#445566',
      }).setOrigin(0.5);

      clearBg.on('pointerover', () => { clearBg.setFillStyle(0x2a1a1a); clearLbl.setColor('#ff4444'); });
      clearBg.on('pointerout',  () => { clearBg.setFillStyle(0x1a1a2a); clearLbl.setColor('#445566'); });
      clearBg.on('pointerdown', () => { ScoreSystem.clearBoard(); this.scene.restart(); });
    }
  }

  _addButton(x, y, label, callback) {
    const bg = this.add.rectangle(x, y, 110, 16, 0x2a2a4a).setInteractive({ cursor: 'pointer' });
    const t = txt(this, x, y, label, { fontSize: '8px' }).setOrigin(0.5);

    bg.on('pointerover', () => { bg.setFillStyle(0x4444aa); t.setColor('#f5a623'); });
    bg.on('pointerout',  () => { bg.setFillStyle(0x2a2a4a); t.setColor('#ffffff'); });
    bg.on('pointerdown', callback);
  }

  _startNewGame() {
    SaveSystem.deleteSave();
    this.game.registry.set('gameState', SaveSystem.newGame());
    this._launchGameplay();
  }

  _continueGame() {
    const saved = SaveSystem.load();
    this.game.registry.set('gameState', saved ?? SaveSystem.newGame());
    this._launchGameplay();
  }

  _launchGameplay() {
    this.scene.launch(SCENE_HUD);
    this.scene.launch(SCENE_DIALOGUE);
    this.scene.start(SCENE_NEIGHBORHOOD);
  }
}
