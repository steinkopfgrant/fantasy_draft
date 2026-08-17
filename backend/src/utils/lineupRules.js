// backend/src/utils/lineupRules.js
//
// Single source of truth for final-lineup constraints.
//
// TWO RULES:
//   A) TEAM CAP    - at most MAX_PER_TEAM (3) players from the same NFL/NBA team.
//   B) TWO GAMES   - a completed lineup must contain players from at least two
//                    different games. Enforced EARLY: a pick is blocked if it
//                    would leave you with only ONE open roster slot while your
//                    lineup still spans only ONE game. In a normal no-skip
//                    draft that fires on pick 4, so a drafter can still take
//                    4-of-5 from a single game — the pivot just can't be
//                    deferred to the final tap, where the board is thinnest.
//
// WHY ROSTER SLOTS AND NOT PICK NUMBER: skipTurn advances the turn without
// filling a slot, so "your 4th pick" and "your 4th turn" diverge. Everything
// here keys off how many roster slots are filled, which degrades correctly
// when a turn is skipped.
//
// GAME KEYS ARE DERIVED, NOT STAMPED. draftService.ensureStackedWRInBottomRight
// builds player objects in four separate branches, each stamping `matchup`
// independently and bypassing the board generator entirely. Any field stamped
// at generation time would be missing on some of those cells. So we resolve
// team -> game at validation time off the matchup tables. One code path.
//
// FAIL-OPEN BY DESIGN: if a game key can't be resolved (BYE, 'TBD' placeholder,
// a team missing from the week's matchup table) the game rule is skipped for
// that lineup rather than blocking a legitimate pick on bad reference data.

const { NFL_MATCHUPS, NBA_MATCHUPS } = require('./gameLogic');

const MAX_PER_TEAM = 3;
const DEFAULT_ROSTER_SIZE = 5;
const MIN_DISTINCT_GAMES = 2;

const REASON = {
  TEAM_LIMIT: 'TEAM_LIMIT',
  NEEDS_SECOND_GAME: 'NEEDS_SECOND_GAME',
};

const MESSAGES = {
  [REASON.TEAM_LIMIT]: `You can roster at most ${MAX_PER_TEAM} players from the same team.`,
  [REASON.NEEDS_SECOND_GAME]: 'Your lineup needs players from at least two different games.',
};

/**
 * Canonical, order-independent key for the game a team is playing in.
 * 'KC' and 'DEN' both resolve to 'DEN|KC'. Returns null when unresolvable.
 */
const gameKeyOf = (team, sport = 'nfl') => {
  if (!team || team === 'TBD') return null;
  const table = sport === 'nba' ? NBA_MATCHUPS : NFL_MATCHUPS;
  const entry = table[team];
  if (!entry || !entry.opp || entry.opp === 'BYE') return null;
  return [team, entry.opp].sort().join('|');
};

/** Rostered players, in no particular order. Tolerates null/empty slots. */
const rosteredPlayers = (roster) =>
  Object.values(roster || {}).filter((p) => p && p.name);

/**
 * Core check. Returns { valid, code, message }.
 *
 * @param roster    team.roster - slot -> player object (or null)
 * @param candidate the player being considered
 * @param opts      { sport = 'nfl', rosterSize = 5 }
 */
const validateLineupConstraints = (roster, candidate, opts = {}) => {
  const sport = opts.sport || 'nfl';
  const rosterSize = opts.rosterSize || DEFAULT_ROSTER_SIZE;

  if (!candidate || !candidate.name) return { valid: true, code: null, message: null };

  const filled = rosteredPlayers(roster);

  // ---- Rule A: team cap ----
  if (candidate.team) {
    const sameTeam = filled.filter((p) => p.team === candidate.team).length;
    if (sameTeam >= MAX_PER_TEAM) {
      return { valid: false, code: REASON.TEAM_LIMIT, message: MESSAGES[REASON.TEAM_LIMIT] };
    }
  }

  // ---- Rule B: two games, enforced one slot early ----
  const openSlotsAfter = rosterSize - (filled.length + 1);
  if (openSlotsAfter > 1) {
    // Two or more slots still open after this pick — plenty of room to pivot.
    return { valid: true, code: null, message: null };
  }

  const keys = [];
  for (const p of [...filled, candidate]) {
    const k = gameKeyOf(p.team, sport);
    if (!k) return { valid: true, code: null, message: null }; // unresolvable -> fail open
    keys.push(k);
  }

  if (new Set(keys).size < MIN_DISTINCT_GAMES) {
    return { valid: false, code: REASON.NEEDS_SECOND_GAME, message: MESSAGES[REASON.NEEDS_SECOND_GAME] };
  }

  return { valid: true, code: null, message: null };
};

/** Convenience boolean wrapper. */
const isPickAllowed = (roster, candidate, opts) =>
  validateLineupConstraints(roster, candidate, opts).valid;

/**
 * Does ANY legal pick exist on the board for this drafter right now?
 *
 * This is the release valve. A drafter blocked at pick 4 must have somewhere to
 * go; if sniping and budget have left them with nothing, blocking would cost
 * them a roster slot for another drafter's action. Callers use this to decide
 * whether to relax rather than skip.
 *
 * @param canFillAnySlot (player) => boolean - position/slot eligibility, supplied
 *        by the caller so this module stays free of sport/slot logic.
 */
const hasAnyLegalPick = (board, roster, budget, canFillAnySlot, opts = {}) => {
  if (!Array.isArray(board)) return false;
  for (const row of board) {
    if (!Array.isArray(row)) continue;
    for (const cell of row) {
      if (!cell || !cell.name || cell.drafted) continue;
      if (typeof cell.price === 'number' && cell.price > budget) continue;
      if (!canFillAnySlot(cell)) continue;
      if (isPickAllowed(roster, cell, opts)) return true;
    }
  }
  return false;
};

/**
 * Audit a completed lineup. Used at settlement / for logging — NOT as a gate.
 * Returns { valid, violations: [codes], distinctGames, maxSameTeam }.
 */
const auditLineup = (roster, opts = {}) => {
  const sport = opts.sport || 'nfl';
  const filled = rosteredPlayers(roster);
  const violations = [];

  const byTeam = {};
  filled.forEach((p) => { if (p.team) byTeam[p.team] = (byTeam[p.team] || 0) + 1; });
  const maxSameTeam = Object.values(byTeam).reduce((m, n) => Math.max(m, n), 0);
  if (maxSameTeam > MAX_PER_TEAM) violations.push(REASON.TEAM_LIMIT);

  const keys = filled.map((p) => gameKeyOf(p.team, sport)).filter(Boolean);
  const distinctGames = new Set(keys).size;
  const allResolved = keys.length === filled.length;
  if (allResolved && filled.length > 1 && distinctGames < MIN_DISTINCT_GAMES) {
    violations.push(REASON.NEEDS_SECOND_GAME);
  }

  return { valid: violations.length === 0, violations, distinctGames, maxSameTeam };
};

module.exports = {
  MAX_PER_TEAM,
  MIN_DISTINCT_GAMES,
  DEFAULT_ROSTER_SIZE,
  REASON,
  MESSAGES,
  gameKeyOf,
  validateLineupConstraints,
  isPickAllowed,
  hasAnyLegalPick,
  auditLineup,
};