// AnimationRegistry — registers 4-direction walk + idle animations for a character atlas.
//
// Expected atlas frame naming (from Aseprite export):
//   'down-0', 'down-1', 'down-2'   (facing down, 3 walk frames)
//   'up-0',   'up-1',   'up-2'
//   'left-0', 'left-1', 'left-2'
//   'right-0','right-1','right-2'
//
// Walk frames:  0=idle/mid, 1=step-left-foot, 2=step-right-foot  (loop: 0→1→2→1)
// Idle frame:   frame 0 of each direction
//
// Usage:
//   import { registerCharacterAnims } from '../utils/AnimationRegistry.js';
//   registerCharacterAnims(scene.anims, 'sprite-leo');
//   sprite.play('sprite-leo-walk-down');
//   sprite.play('sprite-leo-idle-right');

export function registerCharacterAnims(anims, atlasKey) {
  const dirs = ['down', 'up', 'left', 'right'];
  dirs.forEach(dir => {
    const walkKey = `${atlasKey}-walk-${dir}`;
    const idleKey = `${atlasKey}-idle-${dir}`;

    // Guard: skip if already registered (safe to call multiple times)
    if (!anims.exists(walkKey)) {
      anims.create({
        key: walkKey,
        frames: anims.generateFrameNames(atlasKey, { prefix: `${dir}-`, start: 0, end: 2 }),
        frameRate: 8,
        repeat: -1,
      });
    }
    if (!anims.exists(idleKey)) {
      anims.create({
        key: idleKey,
        frames: [{ key: atlasKey, frame: `${dir}-0` }],
        frameRate: 1,
        repeat: 0,
      });
    }
  });
}

// Returns the facing direction ('down'|'up'|'left'|'right') from a velocity vector.
// Favors the axis with greater magnitude; ties prefer the existing facing.
export function velocityToDir(vx, vy, currentDir = 'down') {
  if (vx === 0 && vy === 0) return currentDir;
  if (Math.abs(vx) >= Math.abs(vy)) return vx > 0 ? 'right' : 'left';
  return vy > 0 ? 'down' : 'up';
}
