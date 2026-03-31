import { BASE_WIDTH, BASE_HEIGHT } from '../constants.js';

// DialogueBox: the visual component that shows character dialogue.
// Features: portrait placeholder, speaker name, typewriter text effect, choice buttons.
// Used exclusively by DialogueScene.

const BOX_HEIGHT = 60;
const BOX_Y = BASE_HEIGHT - BOX_HEIGHT - 4;
const PADDING = 8;
const CHARS_PER_SECOND = 40; // typewriter speed

export default class DialogueBox {
  constructor(scene) {
    this._scene = scene;
    this._onAdvance = null;
    this._isTyping = false;
    this._fullText = '';
    this._charIndex = 0;
    this._choiceButtons = [];

    this._build();
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  // Show a single dialogue line. Calls onDone when the player advances past it.
  showLine(line, onDone) {
    this._onAdvance = onDone;
    this._clearChoices();
    this._container.setVisible(true);

    // Speaker name
    this._speakerText.setText(line.speaker?.toUpperCase() ?? '');

    // Portrait color per speaker (placeholder — Phase 7 replaces with sprites)
    const colors = {
      leo: 0x3b82f6, warren: 0xe74c3c, mj: 0x2ecc71,
      carsen: 0x9b59b6, justin: 0xf39c12,
    };
    const key = line.speaker?.toLowerCase();
    this._portrait.setFillStyle(colors[key] ?? 0x666666);

    // Start typewriter
    this._fullText = line.text;
    this._charIndex = 0;
    this._isTyping = true;
    this._bodyText.setText('');
    this._startTypewriter();
  }

  // Show choice buttons after a line. choices = [{text, callback}, ...]
  showChoices(choices) {
    this._clearChoices();
    this._isTyping = false;

    choices.forEach((choice, i) => {
      const y = BOX_Y + PADDING + 10 + i * 16;
      const x = PADDING + 36;

      const bg = this._scene.add.rectangle(x + 80, y, 160, 12, 0x333355)
        .setOrigin(0.5).setInteractive({ cursor: 'pointer' });

      const label = this._scene.add.text(x + 80, y, choice.text, {
        fontFamily: 'monospace', fontSize: '6px', color: '#ffffff',
      }).setOrigin(0.5);

      bg.on('pointerover', () => bg.setFillStyle(0x5555aa));
      bg.on('pointerout', () => bg.setFillStyle(0x333355));
      bg.on('pointerdown', () => {
        this._clearChoices();
        choice.callback();
      });

      this._choiceButtons.push(bg, label);
    });
  }

  hide() {
    this._container.setVisible(false);
    this._clearChoices();
  }

  // Advance or skip the current line when player presses a key/click
  advance() {
    if (this._isTyping) {
      // Skip to end of current text
      this._isTyping = false;
      if (this._typeTimer) this._typeTimer.remove();
      this._bodyText.setText(this._fullText);
    } else if (this._onAdvance && this._choiceButtons.length === 0) {
      this._onAdvance();
    }
  }

  // ── Internal ──────────────────────────────────────────────────────────────────

  _build() {
    // Dialogue box background
    const bg = this._scene.add.rectangle(
      BASE_WIDTH / 2, BOX_Y + BOX_HEIGHT / 2,
      BASE_WIDTH - 8, BOX_HEIGHT,
      0x111122, 0.92
    );
    const border = this._scene.add.rectangle(
      BASE_WIDTH / 2, BOX_Y + BOX_HEIGHT / 2,
      BASE_WIDTH - 8, BOX_HEIGHT,
      0x5555aa, 0
    ).setStrokeStyle(1, 0x5555aa);

    // Portrait placeholder (colored square — real sprites in Phase 7)
    this._portrait = this._scene.add.rectangle(
      PADDING + 12, BOX_Y + BOX_HEIGHT / 2,
      24, 24, 0x666666
    );

    // Speaker name
    this._speakerText = this._scene.add.text(PADDING + 28, BOX_Y + PADDING, '', {
      fontFamily: 'monospace', fontSize: '7px', color: '#f5a623',
    });

    // Body text
    this._bodyText = this._scene.add.text(PADDING + 28, BOX_Y + PADDING + 12, '', {
      fontFamily: 'monospace', fontSize: '6px', color: '#ffffff',
      wordWrap: { width: BASE_WIDTH - PADDING * 2 - 32 },
      lineSpacing: 3,
    });

    // "Press Space/Click to continue" indicator
    this._continueIndicator = this._scene.add.text(
      BASE_WIDTH - 12, BOX_Y + BOX_HEIGHT - 8, '▶', {
        fontFamily: 'monospace', fontSize: '6px', color: '#aaaaaa',
      }
    ).setOrigin(1, 0);

    this._scene.time.addEvent({
      delay: 400, loop: true,
      callback: () => {
        if (!this._isTyping) {
          this._continueIndicator.setVisible(!this._continueIndicator.visible);
        } else {
          this._continueIndicator.setVisible(false);
        }
      },
    });

    // Group all elements so we can show/hide together
    this._container = this._scene.add.container(0, 0, [
      bg, border, this._portrait,
      this._speakerText, this._bodyText, this._continueIndicator,
    ]);

    // Fix to camera (doesn't scroll with the world)
    this._container.setScrollFactor(0);
    this._container.setDepth(100);
    this._container.setVisible(false);
  }

  _startTypewriter() {
    const delay = 1000 / CHARS_PER_SECOND;
    this._typeTimer = this._scene.time.addEvent({
      delay,
      repeat: this._fullText.length - 1,
      callback: () => {
        this._charIndex++;
        this._bodyText.setText(this._fullText.slice(0, this._charIndex));
        if (this._charIndex >= this._fullText.length) {
          this._isTyping = false;
        }
      },
    });
  }

  _clearChoices() {
    this._choiceButtons.forEach(obj => obj.destroy());
    this._choiceButtons = [];
  }
}
