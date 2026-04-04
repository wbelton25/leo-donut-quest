import { SCENE_DIALOGUE } from '../constants.js';
import DialogueBox from '../ui/DialogueBox.js';
import act1Scripts from '../data/dialogue/act1.json';

// DialogueScene: a persistent parallel scene that handles all dialogue overlays.
// It runs invisibly alongside gameplay scenes and is shown/hidden on demand.
// Any game scene can trigger dialogue via:
//   this.scene.get(SCENE_DIALOGUE).showScript('warren_meet', callback);

export default class DialogueScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_DIALOGUE });
  }

  create() {
    // Build the dialogue box UI
    this._box = new DialogueBox(this);

    // Merge all script data — more acts added in later phases
    this._scripts = { ...act1Scripts };

    this._currentScript = null;
    this._lineIndex = 0;
    this._onComplete = null;

    // Space bar or click advances dialogue — only when a script is active
    this.input.keyboard.on('keydown-SPACE', () => { if (this._currentScript) this._box.advance(); });
    this.input.keyboard.on('keydown-ENTER', () => { if (this._currentScript) this._box.advance(); });
    this.input.on('pointerdown',            () => { if (this._currentScript) this._box.advance(); });
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  // Show a dialogue script by key. onComplete fires when the last line is dismissed.
  showScript(scriptKey, onComplete) {
    const script = this._scripts[scriptKey];
    if (!script || script.length === 0) {
      console.warn(`[DialogueScene] No script found for key: "${scriptKey}"`);
      if (onComplete) onComplete();
      return;
    }

    this._currentScript = script;
    this._lineIndex = 0;
    this._onComplete = onComplete ?? null;

    // Pause the scene that called us so the player can't move during dialogue
    this._pauseGameplay();
    this._showLine();
  }

  // Register additional scripts (called by later acts)
  addScripts(scriptData) {
    Object.assign(this._scripts, scriptData);
  }

  // ── Internal ──────────────────────────────────────────────────────────────────

  _showLine() {
    const line = this._currentScript[this._lineIndex];

    // Check if this line has choices (branching dialogue)
    if (line.choices) {
      this._box.showLine(line, null);
      const choiceOptions = line.choices.map(choice => ({
        text: choice.text,
        callback: () => {
          // For now all choices just advance; Phase 5 will wire consequences
          this._advance();
        },
      }));
      this._box.showChoices(choiceOptions);
    } else {
      this._box.showLine(line, () => this._advance());
    }
  }

  _advance() {
    if (!this._currentScript) return;
    this._lineIndex++;
    if (this._lineIndex >= this._currentScript.length) {
      this._finish();
    } else {
      this._showLine();
    }
  }

  _finish() {
    this._box.hide();
    this._currentScript = null;
    this._resumeGameplay();
    if (this._onComplete) {
      const cb = this._onComplete;
      this._onComplete = null;
      cb();
    }
  }

  _pauseGameplay() {
    // Pause all active gameplay scenes so the player can't move during dialogue
    this.scene.manager.scenes.forEach(scene => {
      if (scene.scene.key !== SCENE_DIALOGUE && scene.scene.isActive()) {
        scene.scene.pause();
      }
    });
  }

  _resumeGameplay() {
    this.scene.manager.scenes.forEach(scene => {
      if (scene.scene.key !== SCENE_DIALOGUE && scene.scene.isPaused()) {
        scene.scene.resume();
      }
    });
  }
}
