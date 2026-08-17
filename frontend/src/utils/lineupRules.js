// frontend/src/utils/lineupRules.js
//
// Client-side mirror of backend/src/utils/lineupRules.js. Used to gray out
// cells that can't legally be picked, so the drafter never taps a blocked
// player. The server remains authoritative — this is UX, not enforcement.
//
// NOTE ON GAME KEYS: this deliberately does NOT duplicate the matchup table.
// Every board cell already carries `matchup` ("vs DEN" / "@ KC"), stamped by
// the backend from the same table, so we parse the opponent out of it. That
// means the client can never drift out of sync with the server's week data —
// there's nothing here to update when the schedule rolls over.

export const MAX_PER_TEAM = 3;
export const MIN_DISTINCT_GAMES = 2;
export const DEFAULT_ROSTER_SIZE = 5;

export const REASON = {
  TEAM_LIMIT: 'TEAM_LIMIT',
  NEEDS_SECOND_GAME: 'NEEDS_SECOND_GAME',
};

export const MESSAGES = {
  [REASON.TEAM_LIMIT]: `You can roster at most ${MAX_PER_TEAM} players from the same team.`,
  [REASON.NEEDS_SECOND_GAME]: 'Your lineup needs players from at least two different games.',
};

/**
 * Canonical, order-independent game key derived from team + matchup string.
 * "LAC" + "vs ARI" -> "ARI|LAC";  "ARI" + "@ LAC" -> "ARI|LAC".
 * Returns null when the opponent can't be parsed (BYE, missing matchup).
 */
export const gameKeyOf = (player) => {
  if (!player || !player.team || player.team === 'TBD') return null;
  const raw = (player.matchup || '').trim();
  if (!raw || raw.toUpperCase() === 'BYE') return null;
  const opp = raw.replace(/^(vs\.?|@)\s*/i, '').trim().toUpperCase();
  if (!opp || opp === 'BYE' || opp === player.team.toUpperCase()) return null;
  return [player.team.toUpperCase(), opp].sort().join('|');
};

const rosteredPlayers = (roster) =>
  Object.values(roster || {}).filter((p) => p && p.name);

/**
 * @returns { valid, code, message }
 */
export const validateLineupConstraints = (roster, candidate, opts = {}) => {
  const rosterSize = opts.rosterSize || DEFAULT_ROSTER_SIZE;
  if (!candidate || !candidate.name) return { valid: true, code: null, message: null };

  const filled = rosteredPlayers(roster);

  // Rule A: at most 3 from one team.
  if (candidate.team) {
    const sameTeam = filled.filter((p) => p.team === candidate.team).length;
    if (sameTeam >= MAX_PER_TEAM) {
      return { valid: false, code: REASON.TEAM_LIMIT, message: MESSAGES[REASON.TEAM_LIMIT] };
    }
  }

  // Rule B: two games, enforced one slot early (pick 4 in a clean draft).
  const openSlotsAfter = rosterSize - (filled.length + 1);
  if (openSlotsAfter > 1) return { valid: true, code: null, message: null };

  const keys = [];
  for (const p of [...filled, candidate]) {
    const k = gameKeyOf(p);
    if (!k) return { valid: true, code: null, message: null }; // fail open
    keys.push(k);
  }
  if (new Set(keys).size < MIN_DISTINCT_GAMES) {
    return { valid: false, code: REASON.NEEDS_SECOND_GAME, message: MESSAGES[REASON.NEEDS_SECOND_GAME] };
  }
  return { valid: true, code: null, message: null };
};

export const isPickAllowed = (roster, candidate, opts) =>
  validateLineupConstraints(roster, candidate, opts).valid;

/**
 * Set of "row-col" keys for cells the drafter cannot legally take right now.
 * Rebuild on every roster/board change and use it to drop the `clickable`
 * class. Deliberately silent — no toast, Underdog-style.
 */
export const getBlockedCellKeys = (board, roster, opts = {}) => {
  const blocked = new Set();
  if (!Array.isArray(board)) return blocked;
  board.forEach((row, r) => {
    if (!Array.isArray(row)) return;
    row.forEach((cell, c) => {
      if (!cell || !cell.name || cell.drafted) return;
      if (!isPickAllowed(roster, cell, opts)) blocked.add(`${r}-${c}`);
    });
  });
  return blocked;
};