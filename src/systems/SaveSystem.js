import { DEFAULT_GAME_STATE } from '../constants.js';

// SaveSystem: saves and loads game state using the browser's localStorage.
// The entire game state is one JSON object. Call save() at checkpoints,
// load() to restore it, and hasSave() to check if a save exists.

const SAVE_KEY = 'leos-donut-quest-save';

export default class SaveSystem {
  // Save the current game state to localStorage
  static save(gameState) {
    try {
      const data = JSON.stringify(gameState);
      localStorage.setItem(SAVE_KEY, data);
      console.log('[SaveSystem] Game saved.');
      return true;
    } catch (e) {
      console.warn('[SaveSystem] Could not save:', e);
      return false;
    }
  }

  // Load game state from localStorage.
  // Returns the saved state object, or null if nothing is saved.
  static load() {
    try {
      const data = localStorage.getItem(SAVE_KEY);
      if (!data) return null;
      const state = JSON.parse(data);
      console.log('[SaveSystem] Game loaded.');
      return state;
    } catch (e) {
      console.warn('[SaveSystem] Could not load save:', e);
      return null;
    }
  }

  // Returns true if a save file exists
  static hasSave() {
    return localStorage.getItem(SAVE_KEY) !== null;
  }

  // Deletes the save (used on new game or after credits)
  static deleteSave() {
    localStorage.removeItem(SAVE_KEY);
    console.log('[SaveSystem] Save deleted.');
  }

  // Returns a fresh default game state (no save needed)
  static newGame() {
    // Deep copy so nothing accidentally mutates the DEFAULT_GAME_STATE constant
    return JSON.parse(JSON.stringify(DEFAULT_GAME_STATE));
  }
}
