import { EVT_DIALOGUE_START, EVT_DIALOGUE_END, SCENE_DIALOGUE } from '../constants.js';

// DialogueSystem: manages dialogue scripts and triggers the DialogueScene overlay.
// Usage from any scene:
//   this.scene.get(SCENE_DIALOGUE).show('warren_meet', () => { /* after dialogue */ });

export default class DialogueSystem {
  constructor(game) {
    this._game = game;
    // All dialogue scripts, loaded lazily per act
    this._scripts = {};
  }

  // Load a JSON script file's contents into memory
  // scriptData should be the imported JSON object (e.g. import act1 from '../data/dialogue/act1.json')
  registerScripts(scriptData) {
    Object.assign(this._scripts, scriptData);
  }

  // Get a specific conversation array by key
  getScript(key) {
    return this._scripts[key] ?? null;
  }

  // Trigger dialogue through the DialogueScene overlay.
  // Pass the scene reference (from any game scene), the script key, and a callback for when it's done.
  static show(fromScene, scriptKey, onComplete) {
    const dialogueScene = fromScene.scene.get(SCENE_DIALOGUE);
    if (!dialogueScene) {
      console.warn('[DialogueSystem] DialogueScene not running.');
      if (onComplete) onComplete();
      return;
    }
    dialogueScene.showScript(scriptKey, onComplete);
  }
}
