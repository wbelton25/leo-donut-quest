import { SCENE_BOOT, SCENE_PRELOAD } from '../constants.js';

// BootScene: loads only the assets needed to display a loading bar,
// then immediately hands off to PreloadScene.
// This ensures the player sees something on screen within the first frame.
export default class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_BOOT });
  }

  preload() {
    // In Phase 7 we'll load a real loading bar spritesheet here.
    // For now, nothing to load - just move on.
  }

  create() {
    this.scene.start(SCENE_PRELOAD);
  }
}
