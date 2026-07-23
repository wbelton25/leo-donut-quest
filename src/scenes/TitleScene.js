import {
  SCENE_TITLE, SCENE_NEIGHBORHOOD, SCENE_HUD, SCENE_DIALOGUE,
  BASE_WIDTH, BASE_HEIGHT, txt, MUSIC_TITLE,
} from '../constants.js';
import SaveSystem from '../systems/SaveSystem.js';
import ScoreSystem from '../systems/ScoreSystem.js';
import BadgeSystem from '../systems/BadgeSystem.js';
import AudioManager from '../systems/AudioManager.js';

export default class TitleScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_TITLE });
  }

  create() {
    AudioManager.playMusic(this, MUSIC_TITLE);
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

    // "Beat your grade" hook (4C) — dares the player to top their best run.
    const best = ScoreSystem.getLeaderboard()[0];
    if (best) {
      txt(this, cx - 60, cy + 70, `BEST: ${best.grade} (${best.initials}) - BEAT IT!`, {
        fontSize: '8px', color: '#f5c542',
      }).setOrigin(0.5);
    }

    txt(this, BASE_WIDTH - 4, BASE_HEIGHT - 6, 'v0.5', {
      fontSize: '6px', color: '#334455',
    }).setOrigin(1, 1);

    // ── Side panel (right): SCORES / BADGES tabs ──────────────────────────────
    this._buildSidePanel();
  }

  _buildSidePanel() {
    const panelX = BASE_WIDTH - 156, panelY = 14, panelW = 148, panelH = BASE_HEIGHT - 28;
    this._panel = { x: panelX, y: panelY, w: panelW, h: panelH };

    // Panel background
    this.add.rectangle(panelX + panelW / 2, panelY + panelH / 2, panelW, panelH, 0x080810, 0.92)
      .setStrokeStyle(1, 0x2a3a4a);

    // Tabs
    this._tab = 'scores';
    const tabY = panelY + 10;
    const mkTab = (cx, key, label) => {
      const bg = this.add.rectangle(cx, tabY, 68, 14, 0x14141c).setInteractive({ useHandCursor: true });
      const lb = txt(this, cx, tabY, label, { fontSize: '8px', color: '#8899aa' }).setOrigin(0.5);
      bg.on('pointerdown', () => { this._tab = key; this._renderPanel(); });
      return { bg, lb, key };
    };
    this._tabs = [
      mkTab(panelX + 40,  'scores', 'SCORES'),
      mkTab(panelX + 110, 'badges', 'BADGES'),
    ];
    this.add.rectangle(panelX + panelW / 2, panelY + 20, panelW - 8, 1, 0x2a3a4a);

    this._panelContent = this.add.container(0, 0);
    this._renderPanel();
  }

  _renderPanel() {
    this._tabs.forEach(t => {
      const active = t.key === this._tab;
      t.bg.setFillStyle(active ? 0x2a2a4a : 0x14141c);
      t.lb.setColor(active ? '#f5a623' : '#8899aa');
    });
    this._panelContent.removeAll(true);
    if (this._tab === 'scores') this._renderScores();
    else                        this._renderBadges();
  }

  _renderScores() {
    const { x: panelX, y: panelY, w: panelW, h: panelH } = this._panel;
    const C = o => { this._panelContent.add(o); return o; };
    const board = ScoreSystem.getLeaderboard();

    if (board.length === 0) {
      C(txt(this, panelX + panelW / 2, panelY + panelH / 2 - 6, 'NO SCORES YET',
        { fontSize: '8px', color: '#445566' }).setOrigin(0.5));
      C(txt(this, panelX + panelW / 2, panelY + panelH / 2 + 12, 'Play to get on\nthe board!',
        { fontSize: '8px', color: '#334455', align: 'center' }).setOrigin(0.5));
      return;
    }

    const rankColors = ['#ffdd00', '#bbbbbb', '#cc8844', '#888888', '#667788'];
    board.forEach((entry, i) => {
      const rowY = panelY + 32 + i * 34;
      const rc   = rankColors[i] ?? '#667788';
      const ini  = entry.initials ?? '???';
      if (i > 0) C(this.add.rectangle(panelX + panelW / 2, rowY - 3, panelW - 12, 1, 0x1a2a3a));
      C(txt(this, panelX + 10, rowY, `#${i + 1}`, { fontSize: '8px', color: rc }));
      C(txt(this, panelX + 30, rowY, ini, { fontSize: '8px', color: '#ffffff' }));
      C(txt(this, panelX + panelW - 8, rowY, `${entry.score}`, { fontSize: '8px', color: '#f5e642' }).setOrigin(1, 0));
      C(txt(this, panelX + 10, rowY + 12, `D:${entry.donuts} C:${entry.partySize}`, { fontSize: '8px', color: '#556677' }));
      C(txt(this, panelX + panelW - 8, rowY + 12, entry.date, { fontSize: '8px', color: '#445566' }).setOrigin(1, 0));
    });

    const clearY = panelY + panelH - 12;
    const clearBg = C(this.add.rectangle(panelX + panelW / 2, clearY, 100, 14, 0x1a1a2a).setInteractive({ useHandCursor: true }));
    const clearLbl = C(txt(this, panelX + panelW / 2, clearY, 'CLEAR SCORES', { fontSize: '8px', color: '#445566' }).setOrigin(0.5));
    clearBg.on('pointerover', () => { clearBg.setFillStyle(0x2a1a1a); clearLbl.setColor('#ff4444'); });
    clearBg.on('pointerout',  () => { clearBg.setFillStyle(0x1a1a2a); clearLbl.setColor('#445566'); });
    clearBg.on('pointerdown', () => { ScoreSystem.clearBoard(); this._renderPanel(); });
  }

  _renderBadges() {
    const { x: panelX, y: panelY, w: panelW, h: panelH } = this._panel;
    const C = o => { this._panelContent.add(o); return o; };
    const badges = BadgeSystem.all();
    const cols = 3, size = 26, gap = 8;
    const gridW = cols * size + (cols - 1) * gap;
    const startX = panelX + (panelW - gridW) / 2 + size / 2;
    const startY = panelY + 34;
    let selName, selHint;

    badges.forEach((b, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const bx = startX + col * (size + gap);
      const by = startY + row * (size + gap);
      const slot = C(this.add.rectangle(bx, by, size, size, b.earned ? 0x3a2f0a : 0x14141c)
        .setStrokeStyle(1, b.earned ? 0xf5c542 : 0x2a2a3a).setInteractive({ useHandCursor: true }));
      if (b.earned) C(this.add.star(bx, by, 5, 4, 9, 0xf5c542));
      else          C(txt(this, bx, by, '?', { fontSize: '8px', color: '#556' }).setOrigin(0.5));
      slot.on('pointerdown', () => {
        selName.setText(b.earned ? b.name : '???').setColor(b.earned ? '#f5c542' : '#667788');
        selHint.setText(b.hint);
      });
    });

    const infoY = startY + 4 * (size + gap) + 2;
    selName = C(txt(this, panelX + panelW / 2, infoY, 'TAP A BADGE', { fontSize: '8px', color: '#8899aa' }).setOrigin(0.5));
    selHint = C(txt(this, panelX + panelW / 2, infoY + 13, 'to see how to earn it',
      { fontSize: '8px', color: '#556677', align: 'center', wordWrap: { width: panelW - 16 } }).setOrigin(0.5, 0));

    C(txt(this, panelX + panelW / 2, panelY + panelH - 20, `BADGES: ${BadgeSystem.earnedCount()}/${badges.length}`,
      { fontSize: '8px', color: '#f5c542' }).setOrigin(0.5));
    C(txt(this, panelX + panelW / 2, panelY + panelH - 8, `FARTS: ${BadgeSystem.unlockedFarts().length}/${BadgeSystem.TOTAL_FARTS} UNLOCKED`,
      { fontSize: '8px', color: '#c6e37b' }).setOrigin(0.5));
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
