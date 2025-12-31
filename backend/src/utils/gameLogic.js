// backend/src/utils/gameLogic.js
// Current week matchups - format: team -> { opp: opponent, home: true/false }
// Update this weekly
const WEEK_MATCHUPS = {
  // AFC East
  BUF: { opp: 'NE', home: true },
  MIA: { opp: 'CLE', home: false },
  NE: { opp: 'BUF', home: false },
  NYJ: { opp: 'LAR', home: true },
  // AFC North
  BAL: { opp: 'HOU', home: true },
  CIN: { opp: 'DEN', home: false },
  CLE: { opp: 'MIA', home: true },
  PIT: { opp: 'KC', home: false },
  // AFC South
  HOU: { opp: 'BAL', home: false },
  IND: { opp: 'NYG', home: true },
  JAX: { opp: 'LV', home: false },
  TEN: { opp: 'JAX', home: true },
  // AFC West
  DEN: { opp: 'CIN', home: true },
  KC: { opp: 'PIT', home: true },
  LV: { opp: 'JAX', home: true },
  LAC: { opp: 'NE', home: true },
  // NFC East
  DAL: { opp: 'TB', home: false },
  NYG: { opp: 'IND', home: false },
  PHI: { opp: 'WAS', home: true },
  WAS: { opp: 'PHI', home: false },
  // NFC North
  CHI: { opp: 'SEA', home: true },
  DET: { opp: 'SF', home: false },
  GB: { opp: 'NO', home: true },
  MIN: { opp: 'GB', home: false },
  // NFC South
  ATL: { opp: 'NYG', home: true },
  CAR: { opp: 'ARI', home: false },
  NO: { opp: 'GB', home: false },
  TB: { opp: 'DAL', home: true },
  // NFC West
  ARI: { opp: 'CAR', home: true },
  LAR: { opp: 'NYJ', home: false },
  SF: { opp: 'DET', home: true },
  SEA: { opp: 'CHI', home: false },
  // College teams (for draft prospects - mark as BYE)
  BSU: { opp: 'BYE', home: true },
  MIAMI: { opp: 'BYE', home: true },
  MISS: { opp: 'BYE', home: true },
  COL: { opp: 'BYE', home: true },
  ALA: { opp: 'BYE', home: true },
  ORE: { opp: 'BYE', home: true },
  UCF: { opp: 'BYE', home: true },
  UNC: { opp: 'BYE', home: true },
  OSU: { opp: 'BYE', home: true },
  IOWA: { opp: 'BYE', home: true },
  ASU: { opp: 'BYE', home: true },
  TAMU: { opp: 'BYE', home: true },
  TEX: { opp: 'BYE', home: true },
  AUB: { opp: 'BYE', home: true },
  UTAH: { opp: 'BYE', home: true },
  TENN: { opp: 'BYE', home: true },
  ARIZ: { opp: 'BYE', home: true },
  MIZ: { opp: 'BYE', home: true },
  IAST: { opp: 'BYE', home: true },
  USC: { opp: 'BYE', home: true },
  TCU: { opp: 'BYE', home: true },
  UGA: { opp: 'BYE', home: true },
  FSU: { opp: 'BYE', home: true },
  PSU: { opp: 'BYE', home: true },
  MICH: { opp: 'BYE', home: true },
  LSU: { opp: 'BYE', home: true },
  BG: { opp: 'BYE', home: true },
  SYR: { opp: 'BYE', home: true },
  KSU: { opp: 'BYE', home: true },
  ILL: { opp: 'BYE', home: true },
};

// Helper to get matchup string
const getMatchupString = (team) => {
  const matchup = WEEK_MATCHUPS[team];
  if (!matchup || matchup.opp === 'BYE') return 'BYE';
  return matchup.home ? `vs ${matchup.opp}` : `@ ${matchup.opp}`;
};

const PLAYER_POOLS = {
  QB: {
    5: [
      {name: 'Josh Allen', team: 'BUF'},
      {name: 'Lamar Jackson', team: 'BAL'},
      {name: 'Jayden Daniels', team: 'WAS'},
      {name: 'Jalen Hurts', team: 'PHI'},
      {name: 'Joe Burrow', team: 'CIN'},
      {name: 'Pat Mahomes', team: 'KC'},
      {name: 'Baker Mayfield', team: 'TB'}
    ],
    4: [
      {name: 'Kyler Murray', team: 'ARI'},
      {name: 'Bo Nix', team: 'DEN'},
      {name: 'Caleb Williams', team: 'CHI'},
      {name: 'Justin Fields', team: 'PIT'},
      {name: 'Brock Purdy', team: 'SF'},
      {name: 'Jared Goff', team: 'DET'},
      {name: 'Dak Prescott', team: 'DAL'},
      {name: 'Justin Herbert', team: 'LAC'},
      {name: 'Drake Maye', team: 'NE'},
      {name: 'CJ Stroud', team: 'HOU'}
    ],
    3: [
      {name: 'Jordan Love', team: 'GB'},
      {name: 'Trevor Lawrence', team: 'JAX'},
      {name: 'JJ McCarthy', team: 'MIN'},
      {name: 'Michael Penix', team: 'ATL'},
      {name: 'Tua', team: 'MIA'},
      {name: 'Bryce Young', team: 'CAR'},
      {name: 'Cam Ward', team: 'MIAMI'},
      {name: 'Stafford', team: 'LAR'},
      {name: 'Geno Smith', team: 'SEA'}
    ],
    2: [
      {name: 'Anthony Richardson', team: 'IND'},
      {name: 'Sam Darnold', team: 'MIN'},
      {name: 'Jaxson Dart', team: 'MISS'},
      {name: 'Tyler Though', team: 'TEN'},
      {name: 'Russell Wilson', team: 'PIT'},
      {name: 'Aaron Rodgers', team: 'NYJ'},
      {name: 'Daniel Jones', team: 'NYG'},
      {name: 'Kirk Cousins', team: 'ATL'}
    ],
    1: [
      {name: 'Joe Flacco', team: 'IND'},
      {name: 'Jameis Winston', team: 'CLE'},
      {name: 'Kenny Pickett', team: 'PHI'},
      {name: 'Spencer Rattler', team: 'NO'},
      {name: 'Shedeur Sanders', team: 'COL'},
      {name: 'Jalen Milroe', team: 'ALA'},
      {name: 'Dillon Gabriel', team: 'ORE'},
      {name: 'Will Levis', team: 'TEN'},
      {name: 'Mac Jones', team: 'JAX'}
    ]
  },
  RB: {
    5: [
      {name: 'Saquon Barkley', team: 'PHI'},
      {name: 'Bijan Robinson', team: 'ATL'},
      {name: 'Jahmyr Gibbs', team: 'DET'},
      {name: 'Ashton Jeanty', team: 'BSU'},
      {name: 'CMC', team: 'SF'},
      {name: 'Derrick Henry', team: 'BAL'},
      {name: 'Devon Achane', team: 'MIA'},
      {name: 'Jonathan Taylor', team: 'IND'},
      {name: 'Bucky Irving', team: 'TB'},
      {name: 'Josh Jacobs', team: 'GB'}
    ],
    4: [
      {name: 'Chase Brown', team: 'CIN'},
      {name: 'Kyren Williams', team: 'LAR'},
      {name: 'Breece Hall', team: 'NYJ'},
      {name: 'James Cook', team: 'BUF'},
      {name: 'Joe Mixon', team: 'HOU'},
      {name: 'Chuba Hubbard', team: 'CAR'},
      {name: 'Kenneth Walker', team: 'SEA'},
      {name: 'Alvin Kamara', team: 'NO'},
      {name: 'James Conner', team: 'ARI'},
      {name: 'RJ Harvey', team: 'UCF'},
      {name: 'David Montgomery', team: 'DET'}
    ],
    3: [
      {name: 'Omarion Hampton', team: 'UNC'},
      {name: 'Aaron Jones', team: 'MIN'},
      {name: 'TreVeyon Henderson', team: 'OSU'},
      {name: 'Quinshon Judkins', team: 'OSU'},
      {name: 'Kaleb Johnson', team: 'IOWA'},
      {name: "D'andre Swift", team: 'CHI'},
      {name: 'Brian Robinson', team: 'WAS'},
      {name: 'Jordan Mason', team: 'SF'},
      {name: 'Najee Harris', team: 'PIT'},
      {name: 'Tony Pollard', team: 'TEN'},
      {name: 'Isiah Pacheco', team: 'KC'},
      {name: 'Zach Charbonnet', team: 'SEA'},
      {name: 'Travis Etienne Jr', team: 'JAX'},
      {name: 'Tyjae Spears', team: 'TEN'},
      {name: 'Javonte Williams', team: 'DEN'},
      {name: 'Tyrone Tracy', team: 'NYG'}
    ],
    2: [
      {name: 'Cam Skattebo', team: 'ASU'},
      {name: 'Bhayshul Tuten', team: 'TAMU'},
      {name: 'Rhamondre Stevenson', team: 'NE'},
      {name: 'Jaydon Blue', team: 'TEX'},
      {name: 'Rachaad White', team: 'TB'},
      {name: 'Tank Bigsby', team: 'JAX'},
      {name: 'Tyler Allgeier', team: 'ATL'},
      {name: 'Austin Ekeler', team: 'WAS'},
      {name: 'Isaac Guerendo', team: 'SF'},
      {name: 'Ray Davis', team: 'BUF'},
      {name: 'Rico Dowdle', team: 'DAL'},
      {name: 'Braelon Allen', team: 'NYJ'}
    ],
    1: [
      {name: 'Trey Benson', team: 'ARI'},
      {name: 'Roschon Johnson', team: 'CHI'},
      {name: 'Will Shipley', team: 'CLE'},
      {name: 'Dylan Sampson', team: 'TENN'},
      {name: 'Jaylen Wright', team: 'MIA'},
      {name: 'DJ Giddens', team: 'KC'},
      {name: 'Kendre Miller', team: 'NO'},
      {name: 'Sean Tucker', team: 'TB'},
      {name: 'Marshawn Lloyd', team: 'GB'},
      {name: 'JK Dobbins', team: 'LAC'},
      {name: 'Jarquez Hunter', team: 'AUB'},
      {name: 'Kareem Hunt', team: 'KC'},
      {name: 'Nick Chubb', team: 'CLE'},
      {name: 'Audric Estime', team: 'DEN'},
      {name: 'Miles Sanders', team: 'CAR'},
      {name: 'Thaj Brooks', team: 'UTAH'},
      {name: 'Jordan James', team: 'ORE'},
      {name: 'Jaleel McLaughlin', team: 'DEN'},
      {name: 'Elijah Mitchell', team: 'SF'},
      {name: 'Keaton Mitchell', team: 'BAL'}
    ]
  },
  WR: {
    5: [
      {name: 'JaMarr Chase', team: 'CIN'},
      {name: 'Justin Jefferson', team: 'MIN'},
      {name: 'CeeDee Lamb', team: 'DAL'},
      {name: 'Puka Nacua', team: 'LAR'},
      {name: 'Malik Nabers', team: 'NYG'},
      {name: 'Amon Ra St Brown', team: 'DET'},
      {name: 'Nico Collins', team: 'HOU'},
      {name: 'Brian Thomas', team: 'JAX'},
      {name: 'Drake London', team: 'ATL'},
      {name: 'AJ Brown', team: 'PHI'},
      {name: 'Tyreek Hill', team: 'MIA'}
    ],
    4: [
      {name: 'Ladd McConkey', team: 'LAC'},
      {name: 'Tee Higgins', team: 'CIN'},
      {name: 'Garrett Wilson', team: 'NYJ'},
      {name: 'Terry McLaurin', team: 'WAS'},
      {name: 'Jaxon Smith-Njigba', team: 'SEA'},
      {name: 'Rashee Rice', team: 'KC'},
      {name: 'Davante Adams', team: 'NYJ'},
      {name: 'Mike Evans', team: 'TB'},
      {name: 'DJ Moore', team: 'CHI'},
      {name: 'Xavier Worthy', team: 'KC'},
      {name: 'Tetairoa McMillian', team: 'ARIZ'},
      {name: 'Travis Hunter', team: 'COL'},
      {name: 'DeVonta Smith', team: 'PHI'},
      {name: 'Jameson Williams', team: 'DET'},
      {name: 'Courtland Sutton', team: 'DEN'},
      {name: 'George Pickens', team: 'PIT'},
      {name: 'Zay Flowers', team: 'BAL'},
      {name: 'DK Metcalf', team: 'SEA'},
      {name: 'Calvin Ridley', team: 'TEN'},
      {name: 'Jaylen Waddle', team: 'MIA'},
      {name: 'Jordan Addison', team: 'MIN'},
      {name: 'Rome Odunze', team: 'CHI'},
      {name: 'Chris Olave', team: 'NO'},
      {name: 'Chris Godwin', team: 'TB'},
      {name: 'Juuan Jennings', team: 'SF'},
      {name: 'Deebo Samuel', team: 'SF'}
    ],
    3: [
      {name: 'Jerry Jeudy', team: 'CLE'},
      {name: 'Jakobi Meyers', team: 'LV'},
      {name: 'Ricky Pearsall', team: 'SF'},
      {name: 'Matthew Golden', team: 'TEX'},
      {name: 'Jayden Reed', team: 'GB'},
      {name: 'Stefon Diggs', team: 'HOU'},
      {name: 'Khalil Shakir', team: 'BUF'},
      {name: 'Cooper Kupp', team: 'LAR'},
      {name: 'Darnell Mooney', team: 'ATL'},
      {name: 'Luther Burden', team: 'MIZ'},
      {name: 'Emeka Egbuka', team: 'OSU'},
      {name: 'Jayden Higgins', team: 'IAST'},
      {name: 'Tre Harris', team: 'MISS'},
      {name: 'Josh Downs', team: 'IND'},
      {name: 'Michael Pittman Jr', team: 'IND'},
      {name: 'Keon Coleman', team: 'BUF'},
      {name: 'Rashid Shaheed', team: 'NO'},
      {name: 'Rashod Bateman', team: 'BAL'}
    ],
    2: [
      {name: 'Marvin Mims', team: 'DEN'},
      {name: 'Kyle Williams', team: 'USC'},
      {name: 'Jack Bech', team: 'TCU'},
      {name: 'Christian Kirk', team: 'JAX'},
      {name: 'Hollywood Brown', team: 'KC'},
      {name: 'Quentin Johnston', team: 'LAC'},
      {name: 'Jalen McMillan', team: 'TB'},
      {name: 'Cedric Tillman', team: 'CLE'},
      {name: 'Romeo Doubs', team: 'GB'},
      {name: 'Adam Thielen', team: 'CAR'},
      {name: 'Alec Pierce', team: 'IND'}
    ],
    1: [
      {name: 'Jaylin Noel', team: 'IAST'},
      {name: 'Xavier Legette', team: 'CAR'},
      {name: 'Wandale Robinson', team: 'NYG'},
      {name: 'Pat Bryant', team: 'ILL'},
      {name: 'DeAndre Hopkins', team: 'KC'},
      {name: 'Keenan Allen', team: 'CHI'},
      {name: 'Andrei Iosivas', team: 'CIN'},
      {name: 'Darius Slayton', team: 'NYG'},
      {name: 'Jalen Coker', team: 'CAR'},
      {name: 'Tyler Lockett', team: 'SEA'},
      {name: 'Calvin Austin', team: 'PIT'},
      {name: 'Tutu Atwell', team: 'LAR'},
      {name: 'Adonai Mitchell', team: 'IND'},
      {name: 'Isaac Teselas', team: 'UGA'},
      {name: 'Dyami Brown', team: 'WAS'},
      {name: 'Dontayvion Wicks', team: 'GB'},
      {name: 'Noah Brown', team: 'WAS'},
      {name: 'Kayshon Boutte', team: 'NE'},
      {name: 'Savion Williams', team: 'TCU'},
      {name: 'Jimmy Horn', team: 'FSU'},
      {name: 'Troy Franklin', team: 'DEN'},
      {name: 'Mack Hollins', team: 'BUF'}
    ]
  },
  TE: {
    5: [
      {name: 'Brock Bowers', team: 'LV'},
      {name: 'Trey McBride', team: 'ARI'},
      {name: 'George Kittle', team: 'SF'},
      {name: 'Sam Laporta', team: 'DET'}
    ],
    4: [
      {name: 'TJ Hockenson', team: 'MIN'},
      {name: 'Jonnu Smith', team: 'MIA'},
      {name: 'Travis Kelce', team: 'KC'},
      {name: 'Mark Andrews', team: 'BAL'},
      {name: 'Evan Engram', team: 'JAX'},
      {name: 'Tyler Warren', team: 'PSU'},
      {name: 'David Njoku', team: 'CLE'},
      {name: 'Tucker Kraft', team: 'GB'},
      {name: 'Colton Loveland', team: 'MICH'},
      {name: 'Dallas Goedert', team: 'PHI'}
    ],
    3: [
      {name: 'Dalton Kincaid', team: 'BUF'},
      {name: 'Jake Ferguson', team: 'DAL'},
      {name: 'Kyle Pitts', team: 'ATL'},
      {name: 'Isaiah Likely', team: 'BAL'},
      {name: 'Brenton Strange', team: 'JAX'},
      {name: 'Zach Ertz', team: 'WAS'},
      {name: 'Pat Freiermuth', team: 'PIT'},
      {name: 'Hunter Henry', team: 'NE'},
      {name: 'Mike Gesicki', team: 'CIN'},
      {name: 'Mason Taylor', team: 'LSU'},
      {name: 'Cade Otton', team: 'TB'}
    ],
    2: [
      {name: 'Dalton Schultz', team: 'HOU'},
      {name: 'Chig Okonkwo', team: 'TEN'},
      {name: "Ja'Tavion Sanders", team: 'TEX'},
      {name: 'Tyler Higbee', team: 'LAR'},
      {name: 'Theo Johnson', team: 'NYG'},
      {name: 'Juwan Johnson', team: 'NO'},
      {name: 'Taysom Hill', team: 'NO'},
      {name: 'Elijah Arroyo', team: 'MIA'}
    ],
    1: [
      {name: 'Noah Gray', team: 'KC'},
      {name: 'Cole Kmet', team: 'CHI'},
      {name: 'Terrence Ferguson', team: 'LV'},
      {name: 'Harold Fannin', team: 'BG'},
      {name: 'Oronde Gadsden', team: 'SYR'},
      {name: 'Will Dissly', team: 'LAC'},
      {name: 'Ben Sinnott', team: 'KSU'},
      {name: 'Tyler Conklin', team: 'NYJ'},
      {name: 'Dawson Knox', team: 'BUF'},
      {name: 'Luke Musgrave', team: 'GB'},
      {name: 'Noah Fant', team: 'SEA'},
      {name: 'Michael Mayer', team: 'LV'},
      {name: 'Gunnar Helm', team: 'TEX'},
      {name: 'Cade Stover', team: 'HOU'},
      {name: 'AJ Barner', team: 'MICH'}
    ]
  }
};

const generatePlayerBoard = (contestType) => {
  const board = [];
  const prices = [5, 4, 3, 2, 1];
  const positions = ['QB', 'RB', 'WR', 'TE'];
  
  // Generate rows 0-4 (prices 5-1) with position-specific players
  prices.forEach(price => {
    const row = [];
    positions.forEach(position => {
      const pool = PLAYER_POOLS[position][price] || [];
      if (pool.length > 0) {
        const randomPlayer = pool[Math.floor(Math.random() * pool.length)];
        row.push({
          ...randomPlayer,
          position: position,
          price: price,
          drafted: false,
          draftedBy: null
        });
      }
    });
    
    // Add FLEX position (5th column) for rows 0-4
    const flexPositions = ['RB', 'WR', 'TE'];
    const flexPos = flexPositions[Math.floor(Math.random() * flexPositions.length)];
    const flexPool = PLAYER_POOLS[flexPos][price] || [];
    if (flexPool.length > 0) {
      const flexPlayer = flexPool[Math.floor(Math.random() * flexPool.length)];
      row.push({
        ...flexPlayer,
        position: 'FLEX',
        originalPosition: flexPos,
        price: price,
        drafted: false,
        draftedBy: null
      });
    }
    
    board.push(row);
  });

  // Add row 5 (bottom row - FLEX row) with mixed prices
  const flexRow = [];
  
  // First position (bottom-left) is always a QB
  const qbPrice = prices[Math.floor(Math.random() * prices.length)];
  const qbPool = PLAYER_POOLS['QB'][qbPrice] || [];
  if (qbPool.length > 0) {
    const qbPlayer = qbPool[Math.floor(Math.random() * qbPool.length)];
    flexRow.push({
      ...qbPlayer,
      position: 'FLEX',
      originalPosition: 'QB',
      price: qbPrice,
      drafted: false,
      draftedBy: null
    });
  }
  
  // Positions 2-4 in FLEX row are RB/WR/TE
  for (let i = 1; i < 4; i++) {
    const flexPositions = ['RB', 'WR', 'TE'];
    const pos = flexPositions[Math.floor(Math.random() * flexPositions.length)];
    const price = prices[Math.floor(Math.random() * prices.length)];
    const pool = PLAYER_POOLS[pos][price] || [];
    if (pool.length > 0) {
      const player = pool[Math.floor(Math.random() * pool.length)];
      flexRow.push({
        ...player,
        position: 'FLEX',
        originalPosition: pos,
        price: price,
        drafted: false,
        draftedBy: null
      });
    }
  }
  
  // CRITICAL: Leave bottom-right (position 5) as NULL initially
  // It will be filled by ensureStackedWRInBottomRight
  flexRow.push(null);
  
  board.push(flexRow);

  // Ensure at least one RB in flex spots
  const flexSpots = [];
  // Column 4 (FLEX column) in rows 0-4
  for (let row = 0; row < 5; row++) {
    if (board[row][4]) flexSpots.push({ row, col: 4 });
  }
  // Row 5 positions 1-3
  for (let col = 1; col < 4; col++) {
    if (board[5][col]) flexSpots.push({ row: 5, col });
  }

  const hasRBInFlex = flexSpots.some(spot => 
    board[spot.row][spot.col]?.originalPosition === 'RB'
  );

  if (!hasRBInFlex && flexSpots.length > 0) {
    const spotToReplace = flexSpots[Math.floor(Math.random() * flexSpots.length)];
    const price = board[spotToReplace.row][spotToReplace.col].price;
    const rbPool = PLAYER_POOLS['RB'][price] || [];
    if (rbPool.length > 0) {
      const rbPlayer = rbPool[Math.floor(Math.random() * rbPool.length)];
      board[spotToReplace.row][spotToReplace.col] = {
        ...rbPlayer,
        position: 'FLEX',
        originalPosition: 'RB',
        price: price,
        drafted: false,
        draftedBy: null
      };
    }
  }

  // Add matchup info to all players
  board.forEach(row => {
    row.forEach(player => {
      if (player && player.team) {
        player.matchup = getMatchupString(player.team);
      }
    });
  });

  return board;
};

const calculateKingpinBonus = (team, newPlayer) => {
  let bonusAdded = 0;
  
  // Check for duplicate player bonus
  const duplicates = team.players.filter(p => 
    p.name === newPlayer.name && p.team === newPlayer.team
  );
  if (duplicates.length === 2) {
    bonusAdded++;
  }
  
  // Check for QB + pass catcher stack
  const teamQB = team.players.find(p => 
    (p.position === 'QB' || p.originalPosition === 'QB') && 
    p.team === newPlayer.team
  );
  const isPassCatcher = ['WR', 'TE'].includes(newPlayer.position) || 
    ['WR', 'TE'].includes(newPlayer.originalPosition);
  
  if (teamQB && isPassCatcher) {
    bonusAdded++;
  }
  
  // Or if new player is QB, check for existing pass catchers
  const isQB = newPlayer.position === 'QB' || newPlayer.originalPosition === 'QB';
  if (isQB) {
    const hasPassCatcher = team.players.some(p => 
      p !== newPlayer &&
      p.team === newPlayer.team &&
      (['WR', 'TE'].includes(p.position) || 
       ['WR', 'TE'].includes(p.originalPosition))
    );
    if (hasPassCatcher) {
      bonusAdded++;
    }
  }
  
  return bonusAdded;
};

const applySkipPenalty = (teams, skippingTeamIndex) => {
  teams.forEach((team, index) => {
    if (index !== skippingTeamIndex) {
      team.budget += 1;
    }
  });
};

// CommonJS exports for Node.js
module.exports = {
  PLAYER_POOLS,
  WEEK_MATCHUPS,
  getMatchupString,
  generatePlayerBoard,
  calculateKingpinBonus,
  applySkipPenalty
};