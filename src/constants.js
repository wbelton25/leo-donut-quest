// ─── Tile & Resolution ────────────────────────────────────────────────────────
export const TILE_SIZE   = 16;
export const BASE_WIDTH  = 480;  // 480×270 is 16:9; INTEGER_FIT gives exactly 4× on 1080p
export const BASE_HEIGHT = 270;  // (1080 ÷ 270 = 4.0 — perfect integer, no sub-pixel blur)

// ─── Map scale ────────────────────────────────────────────────────────────────
// Each tile represents 8 real-world meters.
// Leo→Warren is ~1 mile (1600m) = ~200 tiles. World is 250×160 tiles = 4000×2560px.
export const METERS_PER_TILE = 8;

// ─── Font ─────────────────────────────────────────────────────────────────────
// Press Start 2P: a pixel-grid font designed on an 8px baseline.
// IMPORTANT: only use fontSize values that are multiples of 8 (8px, 16px).
// Any smaller size (5px, 6px) breaks the grid and always looks grainy.
export const PIXEL_FONT = '"Press Start 2P", monospace';

// TEXT_RES must match the actual INTEGER_FIT scale factor for the user's screen.
// If the scale is 4× but TEXT_RES is only 3×, text upscales 1.33× → blur.
// Math.ceil ensures we're always at or above the scale factor.
export const TEXT_RES = Math.max(4, Math.ceil(window.screen.height / BASE_HEIGHT));

// Convenience wrapper — use this instead of scene.add.text() everywhere.
// Disables CSS font smoothing on the text canvas to minimise anti-aliasing.
// ALWAYS use 8px or 16px for fontSize — Press Start 2P is an 8px-grid font.
export function txt(scene, x, y, content, style = {}) {
  const obj = scene.add.text(x, y, content, {
    fontFamily: PIXEL_FONT,
    fontSize: '8px',
    color: '#ffffff',
    ...style,
  });
  obj.setResolution(TEXT_RES);
  // Ask the browser not to smooth the font glyphs on this canvas element.
  // These are non-standard in places but widely supported in Chrome/Edge/Firefox.
  obj.canvas.style.fontSmooth          = 'never';
  obj.canvas.style.webkitFontSmoothing = 'none';
  obj.canvas.style.mozOsxFontSmoothing = 'unset';
  obj.updateText();
  return obj;
}

// ─── Physics ──────────────────────────────────────────────────────────────────
// Faster speed to feel right on the larger map (~1 mile journey)
export const PLAYER_SPEED = 180;

// ─── Asset Keys ───────────────────────────────────────────────────────────────
// Sprites
export const SPRITE_LEO = 'sprite-leo';
export const SPRITE_WARREN = 'sprite-warren';
export const SPRITE_MJ = 'sprite-mj';
export const SPRITE_CARSON = 'sprite-carson';
export const SPRITE_JUSTIN = 'sprite-justin';

// Tilemaps & tilesets
export const MAP_TEST = 'map-test';
export const MAP_NEIGHBORHOOD = 'map-neighborhood';
export const MAP_BOSS_ARENA = 'map-boss-arena';
export const MAP_DONUT_SHOP = 'map-donut-shop';
export const TILESET_NEIGHBORHOOD = 'tileset-neighborhood';

// UI
export const UI_LOADING_BG = 'ui-loading-bg';
export const UI_LOADING_BAR = 'ui-loading-bar';

// Audio
export const MUSIC_TITLE = 'music-title';
export const MUSIC_NEIGHBORHOOD = 'music-neighborhood';
export const MUSIC_BOSS = 'music-boss';
export const SFX_FART = 'sfx-fart';
export const SFX_SLINGSHOT = 'sfx-slingshot';

// ─── Scene Keys ───────────────────────────────────────────────────────────────
export const SCENE_BOOT = 'BootScene';
export const SCENE_PRELOAD = 'PreloadScene';
export const SCENE_TITLE = 'TitleScene';
export const SCENE_HUD = 'HudScene';
export const SCENE_NEIGHBORHOOD = 'NeighborhoodScene';
export const SCENE_FRIEND_HOUSE = 'FriendHouseScene';
export const SCENE_BOSS = 'BossScene';
export const SCENE_OREGON_TRAIL = 'OregonTrailScene';
export const SCENE_DONUT_SHOP = 'DonutShopScene';
export const SCENE_FINAL_BOSS = 'FinalBossScene';
export const SCENE_DIALOGUE = 'DialogueScene';
export const SCENE_GAME_OVER  = 'GameOverScene';
export const SCENE_GRACE_BOSS      = 'GraceBossScene';
export const SCENE_MAX_BOSS        = 'MaxBossScene';
export const SCENE_NORA_BOSS       = 'NoraBossScene';
export const SCENE_JUSTIN_MAX_BOSS = 'JustinMaxBossScene';
export const SCENE_RETURN_JOURNEY  = 'ReturnJourneyScene';
export const SCENE_BOSS_GAUNTLET   = 'BossGauntletScene';
export const SCENE_EDIE_BOSS       = 'EdieBossScene';
export const SCENE_CREDITS = 'CreditsScene';

// ─── Event Bus Keys ───────────────────────────────────────────────────────────
export const EVT_RESOURCE_UPDATE = 'resource-update';
export const EVT_PARTY_UPDATE = 'party-update';
export const EVT_ABILITY_USED = 'ability-used';
export const EVT_BOSS_DEFEATED = 'boss-defeated';
export const EVT_DIALOGUE_START = 'dialogue-start';
export const EVT_DIALOGUE_END = 'dialogue-end';

// ─── Party Member IDs ─────────────────────────────────────────────────────────
export const PARTY_WARREN = 'warren';
export const PARTY_MJ = 'mj';
export const PARTY_CARSON = 'carson';
export const PARTY_JUSTIN = 'justin';

// ─── Default Game State ───────────────────────────────────────────────────────
// This is the starting state for a new game. SaveSystem serializes/deserializes this shape.
export const DEFAULT_GAME_STATE = {
  act: 1,
  party: [],           // IDs of recruited members currently in the group
  lostMembers: [],     // IDs of members lost during Oregon Trail
  defeatedBosses: [],  // IDs of defeated bosses
  checkpoint: 'home',  // last safe save point
  resources: {
    time: 100,         // time remaining before donut shop closes (0-100)
    bikeCondition: 100, // bike health (0-100)
    energy: 100,       // party energy (0-100)
    snacks: 0,         // snack count (buy at Walmart — $10 per party member pooled)
    money: 50,         // dollars ($10 × 5 members; reduced if fewer recruited)
  },
  donuts: 0,           // donuts collected at the shop
};
