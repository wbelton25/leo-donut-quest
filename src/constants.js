// ─── Tile & Resolution ────────────────────────────────────────────────────────
export const TILE_SIZE = 16;
export const BASE_WIDTH = 320;
export const BASE_HEIGHT = 240;
export const SCALE = 3; // canvas is displayed at 3x (960x720 on screen)

// ─── Physics ──────────────────────────────────────────────────────────────────
export const PLAYER_SPEED = 120;

// ─── Asset Keys ───────────────────────────────────────────────────────────────
// Sprites
export const SPRITE_LEO = 'sprite-leo';
export const SPRITE_WARREN = 'sprite-warren';
export const SPRITE_MJ = 'sprite-mj';
export const SPRITE_CARSEN = 'sprite-carsen';
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
export const SCENE_GAME_OVER = 'GameOverScene';
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
export const PARTY_CARSEN = 'carsen';
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
    snacks: 5,         // snack count
    money: 20,         // dollars
  },
  donuts: 0,           // donuts collected at the shop
};
