// backend/src/utils/gameLogic.js
// Week 18 NFL Matchups - January 4-5, 2026
// Update this weekly
const WEEK_MATCHUPS = {
  // AFC East
  BUF: { opp: 'NYJ', home: true },
  MIA: { opp: 'NE', home: false },
  NE: { opp: 'MIA', home: true },
  NYJ: { opp: 'BUF', home: false },
  // AFC North
  BAL: { opp: 'PIT', home: false },
  CIN: { opp: 'CLE', home: true },
  CLE: { opp: 'CIN', home: false },
  PIT: { opp: 'BAL', home: true },
  // AFC South
  HOU: { opp: 'IND', home: true },
  IND: { opp: 'HOU', home: false },
  JAX: { opp: 'TEN', home: true },
  TEN: { opp: 'JAX', home: false },
  // AFC West
  DEN: { opp: 'LAC', home: true },
  KC: { opp: 'LV', home: false },
  LV: { opp: 'KC', home: true },
  LAC: { opp: 'DEN', home: false },
  // NFC East
  DAL: { opp: 'NYG', home: false },
  NYG: { opp: 'DAL', home: true },
  PHI: { opp: 'WAS', home: true },
  WAS: { opp: 'PHI', home: false },
  // NFC North
  CHI: { opp: 'DET', home: true },
  DET: { opp: 'CHI', home: false },
  GB: { opp: 'MIN', home: false },
  MIN: { opp: 'GB', home: true },
  // NFC South
  ATL: { opp: 'NO', home: true },
  CAR: { opp: 'TB', home: false },
  NO: { opp: 'ATL', home: false },
  TB: { opp: 'CAR', home: true },
  // NFC West
  ARI: { opp: 'LAR', home: false },
  LAR: { opp: 'ARI', home: true },
  SF: { opp: 'SEA', home: true },
  SEA: { opp: 'SF', home: false },
};

// Helper to get matchup string
const getMatchupString = (team) => {
  const matchup = WEEK_MATCHUPS[team];
  if (!matchup || matchup.opp === 'BYE') return 'BYE';
  return matchup.home ? `vs ${matchup.opp}` : `@ ${matchup.opp}`;
};

// Week 18 Player Pools
const PLAYER_POOLS = {
  QB: {
    5: [
      { name: 'Drake Maye', team: 'NE' },
      { name: 'Josh Allen', team: 'BUF' },
      { name: 'Matthew Stafford', team: 'LAR' },
      { name: 'Dak Prescott', team: 'DAL' },
      { name: 'Joe Burrow', team: 'CIN' },
      { name: 'Caleb Williams', team: 'CHI' }
    ],
    4: [
      { name: 'Jalen Hurts', team: 'PHI' },
      { name: 'Trevor Lawrence', team: 'JAX' },
      { name: 'Lamar Jackson', team: 'BAL' },
      { name: 'Bo Nix', team: 'DEN' },
      { name: 'Jared Goff', team: 'DET' },
      { name: 'Justin Herbert', team: 'LAC' },
      { name: 'Brock Purdy', team: 'SF' },
      { name: 'Baker Mayfield', team: 'TB' }
    ],
    3: [
      { name: 'Jackson Dart', team: 'NYG' },
      { name: 'Jacoby Brissett', team: 'ARI' },
      { name: 'Jordan Love', team: 'GB' },
      { name: 'CJ Stroud', team: 'HOU' },
      { name: 'Sam Darnold', team: 'MIN' }
    ],
    2: [
      { name: 'Tyler Shough', team: 'NO' },
      { name: 'JJ McCarthy', team: 'MIN' },
      { name: 'Kirk Cousins', team: 'ATL' },
      { name: 'Aaron Rodgers', team: 'NYJ' },
      { name: 'Shedeur Sanders', team: 'CLE' },
      { name: 'Malik Willis', team: 'GB' },
      { name: 'Bryce Young', team: 'CAR' }
    ],
    1: [
      { name: 'Cam Ward', team: 'TEN' },
      { name: 'Riley Leonard', team: 'IND' },
      { name: 'Quinn Ewers', team: 'MIA' },
      { name: 'Chris Oladokun', team: 'KC' },
      { name: 'Kenny Pickett', team: 'LV' }
    ]
  },
  RB: {
    5: [
      { name: 'Christian McCaffrey', team: 'SF' },
      { name: 'Bijan Robinson', team: 'ATL' },
      { name: 'Devon Achane', team: 'MIA' },
      { name: 'Jahmyr Gibbs', team: 'DET' },
      { name: 'James Cook III', team: 'BUF' },
      { name: 'Jonathan Taylor', team: 'IND' },
      { name: 'Derrick Henry', team: 'BAL' }
    ],
    4: [
      { name: 'Chase Brown', team: 'CIN' },
      { name: 'Saquon Barkley', team: 'PHI' },
      { name: 'Travis Etienne Jr.', team: 'JAX' },
      { name: 'RJ Harvey', team: 'DEN' },
      { name: 'Kyren Williams', team: 'LAR' },
      { name: 'Omarion Hampton', team: 'LAC' },
      { name: 'Ashton Jeanty', team: 'LV' },
      { name: 'Bucky Irving', team: 'TB' }
    ],
    3: [
      { name: 'Josh Jacobs', team: 'GB' },
      { name: 'Jaylen Warren', team: 'PIT' },
      { name: 'Javonte Williams', team: 'DAL' },
      { name: 'Breece Hall', team: 'NYJ' },
      { name: 'Treyveon Henderson', team: 'NE' },
      { name: 'Aaron Jones Sr.', team: 'MIN' },
      { name: 'Deandre Swift', team: 'CHI' },
      { name: 'Kenneth Gainwell', team: 'PHI' },
      { name: 'Woody Marks', team: 'HOU' },
      { name: 'Kenneth Walker', team: 'SEA' },
      { name: 'Zach Charbonnet', team: 'SEA' },
      { name: 'Rhamondre Stevenson', team: 'NE' },
      { name: 'Rico Dowdle', team: 'CAR' }
    ],
    2: [
      { name: 'Tyrone Tracy Jr.', team: 'NYG' },
      { name: 'Emmanuel Wilson', team: 'GB' },
      { name: 'Tony Pollard', team: 'TEN' },
      { name: 'Alvin Kamara', team: 'NO' },
      { name: 'Kyle Monangai', team: 'NE' },
      { name: 'Chris Rodriguez Jr.', team: 'WAS' },
      { name: 'Jonathon Brooks', team: 'CAR' },
      { name: 'Malik Davis', team: 'DAL' },
      { name: 'Isiah Pacheco', team: 'KC' },
      { name: 'Dylan Sampson', team: 'TEN' },
      { name: 'Michael Carter', team: 'ARI' },
      { name: 'Devin Singletary', team: 'NYG' },
      { name: 'David Montgomery', team: 'DET' },
      { name: 'Audric Estime', team: 'DEN' },
      { name: 'Brian Robinson Jr.', team: 'WAS' },
      { name: 'Tyjae Spears', team: 'TEN' },
      { name: 'Rachaad White', team: 'TB' },
      { name: 'Chuba Hubbard', team: 'CAR' }
    ],
    1: [
      { name: 'Ty Johnson', team: 'BUF' },
      { name: 'Ray Davis', team: 'BUF' },
      { name: 'Nick Chubb', team: 'CLE' },
      { name: 'Ameer Abdullah', team: 'LV' },
      { name: 'Kareem Hunt', team: 'KC' },
      { name: 'Isiah Davis', team: 'NYJ' },
      { name: 'Tyler Allgeier', team: 'ATL' },
      { name: 'Keaton Mitchell', team: 'BAL' },
      { name: 'Ty Chandler', team: 'MIN' },
      { name: 'Samaje Perine', team: 'KC' },
      { name: 'Jawhar Jordan', team: 'HOU' },
      { name: 'Rashad Smith', team: 'MIA' },
      { name: 'Ronnie Rivers', team: 'LAR' },
      { name: 'Jaylen Wright', team: 'MIA' },
      { name: 'Will Shipley', team: 'PHI' },
      { name: 'Sean Tucker', team: 'TB' }
    ]
  },
  WR: {
    5: [
      { name: 'Puka Nacua', team: 'LAR' },
      { name: 'Jaxon Smith-Njigba', team: 'SEA' },
      { name: "Ja'Marr Chase", team: 'CIN' },
      { name: 'Amon-Ra St. Brown', team: 'DET' },
      { name: 'CeeDee Lamb', team: 'DAL' },
      { name: 'Nico Collins', team: 'HOU' },
      { name: 'Drake London', team: 'ATL' }
    ],
    4: [
      { name: 'Chris Olave', team: 'NO' },
      { name: 'George Pickens', team: 'PIT' },
      { name: 'AJ Brown', team: 'PHI' },
      { name: 'Justin Jefferson', team: 'MIN' },
      { name: 'Tee Higgins', team: 'CIN' },
      { name: 'Stefon Diggs', team: 'HOU' },
      { name: 'Zay Flowers', team: 'BAL' },
      { name: 'Wan\'Dale Robinson', team: 'NYG' },
      { name: 'Courtland Sutton', team: 'DEN' }
    ],
    3: [
      { name: 'Jameson Williams', team: 'DET' },
      { name: 'Michael Wilson', team: 'ARI' },
      { name: 'Ladd McConkey', team: 'LAC' },
      { name: 'DeVonta Smith', team: 'PHI' },
      { name: 'Terry McLaurin', team: 'WAS' },
      { name: 'Jaylen Waddle', team: 'MIA' },
      { name: 'Jakobi Meyers', team: 'LV' },
      { name: 'Rome Odunze', team: 'CHI' },
      { name: 'Jauan Jennings', team: 'SF' },
      { name: 'DJ Moore', team: 'CHI' },
      { name: 'Brian Thomas Jr.', team: 'JAX' },
      { name: 'Luther Burden III', team: 'STL' },
      { name: 'Christian Watson', team: 'GB' },
      { name: 'Parker Washington', team: 'JAX' },
      { name: 'Quentin Johnston', team: 'LAC' },
      { name: 'Mike Evans', team: 'TB' },
      { name: 'Chris Godwin', team: 'TB' },
      { name: 'Emeke Egbuka', team: 'TB' },
      { name: 'Tez McMillan', team: 'CAR' }
    ],
    2: [
      { name: 'Ricky Pearsall', team: 'SF' },
      { name: 'Deebo Samuel Sr.', team: 'SF' },
      { name: 'Khalil Shakir', team: 'BUF' },
      { name: 'Troy Franklin', team: 'DEN' },
      { name: 'Kayshaun Boutte', team: 'NE' },
      { name: 'Jordan Addison', team: 'MIN' },
      { name: 'Romeo Doubs', team: 'GB' },
      { name: 'Michael Pittman Jr.', team: 'IND' },
      { name: 'Xavier Worthy', team: 'KC' },
      { name: 'Keenan Allen', team: 'CHI' },
      { name: 'Alec Pierce', team: 'IND' },
      { name: 'Jayden Higgins', team: 'CIN' },
      { name: 'Chimere Dike', team: 'JAX' }
    ],
    1: [
      { name: 'Rashid Shaheed', team: 'NO' },
      { name: 'Kyle Williams', team: 'LAR' },
      { name: 'Josh Downs', team: 'IND' },
      { name: 'Adonai Mitchell', team: 'IND' },
      { name: 'Darius Slayton', team: 'NYG' },
      { name: 'Jerry Jeudy', team: 'CLE' },
      { name: 'Tre Tucker', team: 'LV' },
      { name: 'Marquise Brown', team: 'KC' },
      { name: 'Jack Bech', team: 'CHI' },
      { name: 'Elijah Ayomanor', team: 'LAC' },
      { name: 'Darnell Mooney', team: 'ATL' },
      { name: 'Jahan Dotson', team: 'PHI' },
      { name: 'DeMario Douglas', team: 'NE' },
      { name: 'Matthew Golden', team: 'NYJ' },
      { name: 'Kendrick Bourne', team: 'NE' },
      { name: 'KaVontae Turpin', team: 'DAL' },
      { name: 'Malik Washington', team: 'MIA' },
      { name: 'Dontayvion Wicks', team: 'GB' },
      { name: 'Isaac TeSLaa', team: 'CHI' },
      { name: 'Cooper Kupp', team: 'LAR' },
      { name: 'Marvin Mims', team: 'DEN' },
      { name: 'Tre Harris', team: 'PHI' },
      { name: 'Jaylin Noel', team: 'IND' },
      { name: 'Andrei Iosivas', team: 'CIN' },
      { name: 'Brandin Cooks', team: 'DAL' },
      { name: 'Jalen Nailor', team: 'MIN' },
      { name: 'Xavier Legette', team: 'CAR' }
    ]
  },
  TE: {
    5: [
      { name: 'Trey McBride', team: 'ARI' },
      { name: 'George Kittle', team: 'SF' }
    ],
    4: [
      { name: 'Kyle Pitts', team: 'ATL' },
      { name: 'Harold Fannin Jr.', team: 'CIN' },
      { name: 'Travis Kelce', team: 'KC' },
      { name: 'Hunter Henry', team: 'NE' },
      { name: 'Tyler Warren', team: 'PIT' },
      { name: 'Juwan Johnson', team: 'NO' },
      { name: 'Dallas Goedert', team: 'PHI' },
      { name: 'Colston Loveland', team: 'DET' },
      { name: 'Brenton Strange', team: 'JAX' }
    ],
    3: [
      { name: 'Dalton Schultz', team: 'HOU' },
      { name: 'AJ Barner', team: 'SEA' },
      { name: 'Colby Parkinson', team: 'LAR' },
      { name: 'Oronde Gadsden II', team: 'MIA' },
      { name: 'Darren Waller', team: 'NYG' },
      { name: 'Dawson Knox', team: 'BUF' },
      { name: 'Mark Andrews', team: 'BAL' },
      { name: 'Michael Mayer', team: 'LV' },
      { name: 'Theo Johnson', team: 'NYG' },
      { name: 'Chig Okonkwo', team: 'TEN' },
      { name: 'Cade Otton', team: 'TB' }
    ],
    2: [
      { name: 'Mike Gesicki', team: 'CIN' },
      { name: 'Pat Freiermuth', team: 'PIT' },
      { name: 'Evan Engram', team: 'JAX' },
      { name: 'TJ Hockenson', team: 'MIN' },
      { name: 'Josh Oliver', team: 'MIN' },
      { name: 'Isaiah Likely', team: 'BAL' },
      { name: 'Jake Tonges', team: 'CHI' },
      { name: 'Ben Sinnott', team: 'WAS' },
      { name: 'Cole Kmet', team: 'CHI' },
      { name: 'Taysom Hill', team: 'NO' }
    ],
    1: [
      { name: 'Daniel Bellinger', team: 'NYG' },
      { name: 'Luke Schoonmaker', team: 'DAL' },
      { name: 'Luke Musgrave', team: 'GB' },
      { name: 'Noah Fant', team: 'SEA' },
      { name: 'Jonnu Smith', team: 'MIA' },
      { name: 'John Bates', team: 'WAS' },
      { name: 'Terrance Ferguson', team: 'LV' },
      { name: 'Greg Dulcich', team: 'DEN' }
    ]
  }
};

// Generate a random player board for drafts
const generatePlayerBoard = () => {
  const board = [];
  const usedPlayers = new Set();
  
  // 5 rows (price levels $5-$1), columns vary by position needs
  for (let priceLevel = 5; priceLevel >= 1; priceLevel--) {
    const row = [];
    
    // Each row has mix of positions - QB, RB, WR, TE, FLEX
    // Add 1 QB
    const qbPool = PLAYER_POOLS.QB[priceLevel] || [];
    const availableQBs = qbPool.filter(p => !usedPlayers.has(p.name));
    if (availableQBs.length > 0) {
      const qb = availableQBs[Math.floor(Math.random() * availableQBs.length)];
      usedPlayers.add(qb.name);
      row.push({
        ...qb,
        position: 'QB',
        originalPosition: 'QB',
        price: priceLevel,
        matchup: getMatchupString(qb.team),
        drafted: false,
        draftedBy: null
      });
    }
    
    // Add 2 RBs
    const rbPool = PLAYER_POOLS.RB[priceLevel] || [];
    const availableRBs = rbPool.filter(p => !usedPlayers.has(p.name));
    for (let i = 0; i < 2 && i < availableRBs.length; i++) {
      const randomIndex = Math.floor(Math.random() * availableRBs.length);
      const rb = availableRBs.splice(randomIndex, 1)[0];
      usedPlayers.add(rb.name);
      row.push({
        ...rb,
        position: 'RB',
        originalPosition: 'RB',
        price: priceLevel,
        matchup: getMatchupString(rb.team),
        drafted: false,
        draftedBy: null
      });
    }
    
    // Add 2 WRs
    const wrPool = PLAYER_POOLS.WR[priceLevel] || [];
    const availableWRs = wrPool.filter(p => !usedPlayers.has(p.name));
    for (let i = 0; i < 2 && i < availableWRs.length; i++) {
      const randomIndex = Math.floor(Math.random() * availableWRs.length);
      const wr = availableWRs.splice(randomIndex, 1)[0];
      usedPlayers.add(wr.name);
      row.push({
        ...wr,
        position: 'WR',
        originalPosition: 'WR',
        price: priceLevel,
        matchup: getMatchupString(wr.team),
        drafted: false,
        draftedBy: null
      });
    }
    
    // Add 1 TE
    const tePool = PLAYER_POOLS.TE[priceLevel] || [];
    const availableTEs = tePool.filter(p => !usedPlayers.has(p.name));
    if (availableTEs.length > 0) {
      const te = availableTEs[Math.floor(Math.random() * availableTEs.length)];
      usedPlayers.add(te.name);
      row.push({
        ...te,
        position: 'TE',
        originalPosition: 'TE',
        price: priceLevel,
        matchup: getMatchupString(te.team),
        drafted: false,
        draftedBy: null
      });
    }
    
    // Add 1 FLEX (RB/WR/TE)
    const flexPositions = ['RB', 'WR', 'TE'];
    const flexPos = flexPositions[Math.floor(Math.random() * flexPositions.length)];
    const flexPool = PLAYER_POOLS[flexPos][priceLevel] || [];
    const availableFlex = flexPool.filter(p => !usedPlayers.has(p.name));
    if (availableFlex.length > 0) {
      const flex = availableFlex[Math.floor(Math.random() * availableFlex.length)];
      usedPlayers.add(flex.name);
      row.push({
        ...flex,
        position: 'FLEX',
        originalPosition: flexPos,
        price: priceLevel,
        matchup: getMatchupString(flex.team),
        drafted: false,
        draftedBy: null
      });
    }
    
    // Shuffle row
    for (let i = row.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [row[i], row[j]] = [row[j], row[i]];
    }
    
    board.push(row);
  }
  
  // Ensure bottom-right has a stacked WR opportunity
  const bottomRow = board[board.length - 1];
  const rightCol = bottomRow.length - 1;
  
  // Find QB teams on the board
  const qbTeams = new Set();
  for (const row of board) {
    for (const player of row) {
      if (player && (player.position === 'QB' || player.originalPosition === 'QB')) {
        qbTeams.add(player.team);
      }
    }
  }
  
  // Try to put a stacked WR in bottom-right
  if (qbTeams.size > 0) {
    const wrPool = PLAYER_POOLS.WR[1] || [];
    const stackableWRs = wrPool.filter(wr => 
      qbTeams.has(wr.team) && !usedPlayers.has(wr.name)
    );
    
    if (stackableWRs.length > 0) {
      const stackedWR = stackableWRs[Math.floor(Math.random() * stackableWRs.length)];
      bottomRow[rightCol] = {
        ...stackedWR,
        position: 'FLEX',
        originalPosition: 'WR',
        price: 1,
        matchup: getMatchupString(stackedWR.team),
        drafted: false,
        draftedBy: null,
        isStackedWR: true
      };
    }
  }
  
  return board;
};

// Scoring functions
const calculatePlayerScore = (player, stats) => {
  if (!stats) return 0;
  
  let score = 0;
  
  // Passing
  score += (stats.passingYards || 0) * 0.04;
  score += (stats.passingTDs || 0) * 4;
  score -= (stats.interceptions || 0) * 2;
  
  // Rushing
  score += (stats.rushingYards || 0) * 0.1;
  score += (stats.rushingTDs || 0) * 6;
  
  // Receiving
  score += (stats.receptions || 0) * 1; // PPR
  score += (stats.receivingYards || 0) * 0.1;
  score += (stats.receivingTDs || 0) * 6;
  
  // Misc
  score += (stats.fumbleLost || 0) * -2;
  score += (stats.twoPointConversions || 0) * 2;
  
  return Math.round(score * 100) / 100;
};

const calculateLineupScore = (lineup) => {
  if (!lineup || !Array.isArray(lineup)) return 0;
  
  return lineup.reduce((total, slot) => {
    return total + (slot.player?.score || 0);
  }, 0);
};

module.exports = {
  WEEK_MATCHUPS,
  getMatchupString,
  PLAYER_POOLS,
  generatePlayerBoard,
  calculatePlayerScore,
  calculateLineupScore
};
