import { BASE_WIDTH, BASE_HEIGHT, txt } from '../constants.js';

const BOX_HEIGHT = 72;
const BOX_Y = BASE_HEIGHT - BOX_HEIGHT - 4;
const PADDING = 8;
const CHARS_PER_SECOND = 35;

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

  showLine(line, onDone) {
    this._onAdvance = onDone;
    this._clearChoices();
    this._container.setVisible(true);

    this._speakerText.setText(line.speaker?.toUpperCase() ?? '');

    const colors = {
      leo: 0x3b82f6, warren: 0xe74c3c, mj: 0x2ecc71,
      carsen: 0x9b59b6, justin: 0xf39c12,
    };
    this._portrait.setFillStyle(colors[line.speaker?.toLowerCase()] ?? 0x666666);

    this._fullText = line.text;
    this._charIndex = 0;
    this._isTyping = true;
    this._bodyText.setText('');
    this._startTypewriter();
  }

  showChoices(choices) {
    this._clearChoices();
    this._isTyping = false;

    choices.forEach((choice, i) => {
      const y = BOX_Y + PADDING + 12 + i * 18;
      const x = PADDING + 36;

      const bg = this._scene.add.rectangle(x + 90, y, 170, 14, 0x333355)
        .setScrollFactor(0).setDepth(101).setOrigin(0.5).setInteractive({ cursor: 'pointer' });

      const label = txt(this._scene, x + 90, y, choice.text, {
        fontSize: '8px',
      }).setScrollFactor(0).setDepth(101).setOrigin(0.5);

      bg.on('pointerover', () => bg.setFillStyle(0x5555aa));
      bg.on('pointerout',  () => bg.setFillStyle(0x333355));
      bg.on('pointerdown', () => { this._clearChoices(); choice.callback(); });

      this._choiceButtons.push(bg, label);
    });
  }

  hide() {
    this._container.setVisible(false);
    this._clearChoices();
  }

  advance() {
    if (this._isTyping) {
      this._isTyping = false;
      if (this._typeTimer) this._typeTimer.remove();
      this._bodyText.setText(this._fullText);
    } else if (this._onAdvance && this._choiceButtons.length === 0) {
      this._onAdvance();
    }
  }

  _build() {
    const bg = this._scene.add.rectangle(
      BASE_WIDTH / 2, BOX_Y + BOX_HEIGHT / 2,
      BASE_WIDTH - 6, BOX_HEIGHT, 0x111122, 0.93
    );
    const border = this._scene.add.rectangle(
      BASE_WIDTH / 2, BOX_Y + BOX_HEIGHT / 2,
      BASE_WIDTH - 6, BOX_HEIGHT, 0, 0
    ).setStrokeStyle(1, 0x5555cc);

    this._portrait = this._scene.add.rectangle(
      PADDING + 13, BOX_Y + BOX_HEIGHT / 2, 26, 26, 0x666666
    );

    // Speaker name in accent color, body text in white — both using txt() for crispness
    this._speakerText = txt(this._scene, PADDING + 30, BOX_Y + PADDING, '', {
      fontSize: '8px', color: '#f5a623',
    });

    this._bodyText = txt(this._scene, PADDING + 30, BOX_Y + PADDING + 16, '', {
      fontSize: '8px', color: '#ffffff',
      wordWrap: { width: BASE_WIDTH - PADDING * 2 - 36 },
      lineSpacing: 5,
    });

    this._continueIndicator = txt(
      this._scene, BASE_WIDTH - 10, BOX_Y + BOX_HEIGHT - 12, '>', {
        fontSize: '8px', color: '#888888',
      }
    ).setOrigin(1, 0);

    this._scene.time.addEvent({
      delay: 450, loop: true,
      callback: () => {
        this._continueIndicator.setVisible(!this._isTyping && !this._continueIndicator.visible);
      },
    });

    this._container = this._scene.add.container(0, 0, [
      bg, border, this._portrait,
      this._speakerText, this._bodyText, this._continueIndicator,
    ]);
    this._container.setScrollFactor(0);
    this._container.setDepth(100);
    this._container.setVisible(false);
  }

  _startTypewriter() {
    this._typeTimer = this._scene.time.addEvent({
      delay: 1000 / CHARS_PER_SECOND,
      repeat: this._fullText.length - 1,
      callback: () => {
        this._charIndex++;
        this._bodyText.setText(this._fullText.slice(0, this._charIndex));
        if (this._charIndex >= this._fullText.length) this._isTyping = false;
      },
    });
  }

  _clearChoices() {
    this._choiceButtons.forEach(o => o.destroy());
    this._choiceButtons = [];
  }
}
