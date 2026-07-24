// Initials sanitiser — shared by the local board and the public world board.
//
// Three letters is plenty of room for words we don't want sitting on a
// leaderboard a bunch of kids can see, so anything on the blocklist gets
// bounced to 'AAA'. The list is deliberately short and only covers exact
// 3-letter matches; this is a speed bump for the obvious stuff, not a
// content-moderation system.

const BLOCKED = new Set([
  'ASS', 'FUC', 'FUK', 'FCK', 'SHT', 'SHI', 'CUM', 'TIT', 'FAG', 'NIG',
  'NGR', 'DIC', 'DIK', 'COC', 'COK', 'PIS', 'PSS', 'WTF', 'STF',
  'GAY', 'SEX', 'HOE', 'SLT', 'CNT', 'KYS', 'DMN', 'HEL',
]);

// Always returns exactly 3 characters from [A-Z?].
export default function cleanInitials(raw) {
  const up = String(raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .substring(0, 3)
    .padEnd(3, 'A');
  return BLOCKED.has(up) ? 'AAA' : up;
}
