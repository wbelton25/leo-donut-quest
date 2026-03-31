import { SCENE_PRELOAD, SCENE_TITLE, BASE_WIDTH, BASE_HEIGHT, txt } from '../constants.js';

export default class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_PRELOAD });
  }

  preload() {
    this._createLoadingBar();
    this.load.on('progress', (value) => {
      if (this._bar) this._bar.scaleX = value;
    });
  }

  create() {
    // Wait for the Press Start 2P font to finish loading before showing the title screen.
    // document.fonts.ready resolves once all @font-face fonts are loaded.
    document.fonts.ready.then(() => {
      this.scene.start(SCENE_TITLE);
    });
  }

  _createLoadingBar() {
    const cx = BASE_WIDTH / 2;
    const cy = BASE_HEIGHT / 2;

    this.add.rectangle(cx, cy - 10, 200, 12, 0x333333);
    this._bar = this.add.rectangle(cx - 98, cy - 10, 196, 8, 0xf5a623).setOrigin(0, 0.5);
    this._bar.scaleX = 0;

    txt(this, cx, cy + 10, 'Loading...').setOrigin(0.5);
  }
}
