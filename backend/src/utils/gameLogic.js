// backend/src/utils/gameLogic.js
// Current week matchups - format: team -> { opp: opponent, home: true/false }
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
      {name: 'Drake Maye', team: 'NE'},
      {name: 'Josh Allen', team: 'BUF'},
      {name: 'Matthew Stafford', team: 'LAR'},
      {name: 'Dak Prescott', team: 'DAL'},
      {name: 'Joe Burrow', team: 'CIN'},
      {name: 'Caleb Williams', team: 'CHI'}
    ],
    4: [
      {name: 'Jalen Hurts', team: 'PHI'},
      {name: 'Trevor Lawrence', team: 'JAX'},
      {name: 'Lamar Jackson', team: 'BAL'},
      {name: 'Bo Nix', team: 'DEN'},
      {name: 'Jared Goff', team: 'DET'},
      {name: 'Justin Herbert', team: 'LAC'},
      {name: 'Brock Purdy', team: 'SF'},
      {name: 'Baker Mayfield', team: 'TB'}
    ],
    3: [
      {name: 'Jackson Dart', team: 'NYG'},
      {name: 'Jacoby Brissett', team: 'ARI'},
      {name: 'Jordan Love', team: 'GB'},
      {name: 'CJ Stroud', team: 'HOU'},
      {name: 'Sam Darnold', team: 'MIN'}
    ],
    2: [
      {name: 'Tyler Shough', team: 'NO'},
      {name: 'JJ McCarthy', team: 'MIN'},
      {name: 'Kirk Cousins', team: 'ATL'},
      {name: 'Aaron Rodgers', team: 'NYJ'},
      {name: 'Shedeur Sanders', team: 'CLE'},
      {name: 'Malik Willis', team: 'GB'},
      {name: 'Bryce Young', team: 'CAR'}
    ],
    1: [
      {name: 'Cam Ward', team: 'TEN'},
      {name: 'Riley Leonard', team: 'IND'},
      {name: 'Quinn Ewers', team: 'MIA'},
      {name: 'Chris Oladokun', team: 'KC'},
      {name: 'Kenny Pickett', team: 'LV'}
    ]
  },
  RB: {
    5: [
      {name: 'Christian McCaffrey', team: 'SF'},
      {name: 'Bijan Robinson', team: 'ATL'},
      {name: 'Devon Achane', team: 'MIA'},
      {name: 'Jahmyr Gibbs', team: 'DET'},
      {name: 'James Cook III', team: 'BUF'},
      {name: 'Jonathan Taylor', team: 'IND'},
      {name: 'Derrick Henry', team: 'BAL'}
    ],
    4: [
      {name: 'Chase Brown', team: 'CIN'},
      {name: 'Saquon Barkley', team: 'PHI'},
      {name: 'Travis Etienne Jr.', team: 'JAX'},
      {name: 'RJ Harvey', team: 'DEN'},
      {name: 'Kyren Williams', team: 'LAR'},
      {name: 'Omarion Hampton', team: 'LAC'},
      {name: 'Ashton Jeanty', team: 'LV'},
      {name: 'Bucky Irving', team: 'TB'}
    ],
    3: [
      {name: 'Josh Jacobs', team: 'GB'},
      {name: 'Jaylen Warren', team: 'PIT'},
      {name: 'Javonte Williams', team: 'DAL'},
      {name: 'Breece Hall', team: 'NYJ'},
      {name: 'Treyveon Henderson', team: 'NE'},
      {name: 'Aaron Jones Sr.', team: 'MIN'},
      {name: 'Deandre Swift', team: 'CHI'},
      {name: 'Kenneth Gainwell', team: 'PHI'},
      {name: 'Woody Marks', team: 'HOU'},
      {name: 'Kenneth Walker', team: 'SEA'},
      {name: 'Zach Charbonnet', team: 'SEA'},
      {name: 'Rhamondre Stevenson', team: 'NE'},
      {name: 'Rico Dowdle', team: 'CAR'}
    ],
    2: [
      {name: 'Tyrone Tracy Jr.', team: 'NYG'},
      {name: 'Emmanuel Wilson', team: 'GB'},
      {name: 'Tony Pollard', team: 'TEN'},
      {name: 'Alvin Kamara', team: 'NO'},
      {name: 'Kyle Monangai', team: 'NE'},
      {name: 'Chris Rodriguez Jr.', team: 'WAS'},
      {name: 'Jonathon Brooks', team: 'CAR'},
      {name: 'Malik Davis', team: 'DAL'},
      {name: 'Isiah Pacheco', team: 'KC'},
      {name: 'Dylan Sampson', team: 'TEN'},
      {name: 'Michael Carter', team: 'ARI'},
      {name: 'Devin Singletary', team: 'NYG'},
      {name: 'David Montgomery', team: 'DET'},
      {name: 'Audric Estime', team: 'DEN'},
      {name: 'Brian Robinson Jr.', team: 'WAS'},
      {name: 'Tyjae Spears', team: 'TEN'},
      {name: 'Rachaad White', team: 'TB'},
      {name: 'Chuba Hubbard', team: 'CAR'},
      {name: 'Bhayshul Tuten', team: 'JAX'}
    ],
    1: [
      {name: 'Ty Johnson', team: 'BUF'},
      {name: 'Ray Davis', team: 'BUF'},
      {name: 'Nick Chubb', team: 'CLE'},
      {name: 'Ameer Abdullah', team: 'LV'},
      {name: 'Kareem Hunt', team: 'KC'},
      {name: 'Isiah Davis', team: 'NYJ'},
      {name: 'Tyler Allgeier', team: 'ATL'},
      {name: 'Keaton Mitchell', team: 'BAL'},
      {name: 'Ty Chandler', team: 'MIN'},
      {name: 'Samaje Perine', team: 'KC'},
      {name: 'Jawhar Jordan', team: 'HOU'},
      {name: 'Rashad Smith', team: 'MIA'},
      {name: 'Ronnie Rivers', team: 'LAR'},
      {name: 'Jaylen Wright', team: 'MIA'},
      {name: 'Will Shipley', team: 'PHI'},
      {name: 'Sean Tucker', team: 'TB'}
    ]
  },
  WR: {
    5: [
      {name: 'Puka Nacua', team: 'LAR'},
      {name: 'Jaxon Smith-Njigba', team: 'SEA'},
      {name: "Ja'Marr Chase", team: 'CIN'},
      {name: 'Amon-Ra St. Brown', team: 'DET'},
      {name: 'CeeDee Lamb', team: 'DAL'},
      {name: 'Nico Collins', team: 'HOU'},
      {name: 'Drake London', team: 'ATL'}
    ],
    4: [
      {name: 'Chris Olave', team: 'NO'},
      {name: 'George Pickens', team: 'PIT'},
      {name: 'AJ Brown', team: 'PHI'},
      {name: 'Justin Jefferson', team: 'MIN'},
      {name: 'Tee Higgins', team: 'CIN'},
      {name: 'Stefon Diggs', team: 'HOU'},
      {name: 'Zay Flowers', team: 'BAL'},
      {name: "Wan'Dale Robinson", team: 'NYG'},
      {name: 'Courtland Sutton', team: 'DEN'}
    ],
    3: [
      {name: 'Jameson Williams', team: 'DET'},
      {name: 'Michael Wilson', team: 'ARI'},
      {name: 'Ladd McConkey', team: 'LAC'},
      {name: 'DeVonta Smith', team: 'PHI'},
      {name: 'Terry McLaurin', team: 'WAS'},
      {name: 'Jaylen Waddle', team: 'MIA'},
      {name: 'Jakobi Meyers', team: 'LV'},
      {name: 'Rome Odunze', team: 'CHI'},
      {name: 'Jauan Jennings', team: 'SF'},
      {name: 'DJ Moore', team: 'CHI'},
      {name: 'Brian Thomas Jr.', team: 'JAX'},
      {name: 'Luther Burden III', team: 'STL'},
      {name: 'Christian Watson', team: 'GB'},
      {name: 'Parker Washington', team: 'JAX'},
      {name: 'Quentin Johnston', team: 'LAC'},
      {name: 'Mike Evans', team: 'TB'},
      {name: 'Chris Godwin', team: 'TB'},
      {name: 'Emeke Egbuka', team: 'TB'},
      {name: 'Tez McMillan', team: 'CAR'}
    ],
    2: [
      {name: 'Ricky Pearsall', team: 'SF'},
      {name: 'Deebo Samuel Sr.', team: 'SF'},
      {name: 'Khalil Shakir', team: 'BUF'},
      {name: 'Troy Franklin', team: 'DEN'},
      {name: 'Kayshaun Boutte', team: 'NE'},
      {name: 'Jordan Addison', team: 'MIN'},
      {name: 'Romeo Doubs', team: 'GB'},
      {name: 'Michael Pittman Jr.', team: 'IND'},
      {name: 'Xavier Worthy', team: 'KC'},
      {name: 'Keenan Allen', team: 'CHI'},
      {name: 'Alec Pierce', team: 'IND'},
      {name: 'Jayden Higgins', team: 'CIN'},
      {name: 'Chimere Dike', team: 'JAX'}
    ],
    1: [
      {name: 'Rashid Shaheed', team: 'NO'},
      {name: 'Kyle Williams', team: 'LAR'},
      {name: 'Josh Downs', team: 'IND'},
      {name: 'Adonai Mitchell', team: 'IND'},
      {name: 'Darius Slayton', team: 'NYG'},
      {name: 'Jerry Jeudy', team: 'CLE'},
      {name: 'Tre Tucker', team: 'LV'},
      {name: 'Marquise Brown', team: 'KC'},
      {name: 'Jack Bech', team: 'CHI'},
      {name: 'Elijah Ayomanor', team: 'LAC'},
      {name: 'Darnell Mooney', team: 'ATL'},
      {name: 'Jahan Dotson', team: 'PHI'},
      {name: 'DeMario Douglas', team: 'NE'},
      {name: 'Matthew Golden', team: 'NYJ'},
      {name: 'Kendrick Bourne', team: 'NE'},
      {name: 'KaVontae Turpin', team: 'DAL'},
      {name: 'Malik Washington', team: 'MIA'},
      {name: 'Dontayvion Wicks', team: 'GB'},
      {name: 'Isaac TeSLaa', team: 'CHI'},
      {name: 'Cooper Kupp', team: 'LAR'},
      {name: 'Marvin Mims', team: 'DEN'},
      {name: 'Tre Harris', team: 'PHI'},
      {name: 'Jaylin Noel', team: 'IND'},
      {name: 'Andrei Iosivas', team: 'CIN'},
      {name: 'Brandin Cooks', team: 'DAL'},
      {name: 'Jalen Nailor', team: 'MIN'},
      {name: 'Xavier Legette', team: 'CAR'}
    ]
  },
  TE: {
    5: [
      {name: 'Trey McBride', team: 'ARI'},
      {name: 'George Kittle', team: 'SF'}
    ],
    4: [
      {name: 'Kyle Pitts', team: 'ATL'},
      {name: 'Harold Fannin Jr.', team: 'CIN'},
      {name: 'Travis Kelce', team: 'KC'},
      {name: 'Hunter Henry', team: 'NE'},
      {name: 'Tyler Warren', team: 'PIT'},
      {name: 'Juwan Johnson', team: 'NO'},
      {name: 'Dallas Goedert', team: 'PHI'},
      {name: 'Colston Loveland', team: 'DET'},
      {name: 'Brenton Strange', team: 'JAX'}
    ],
    3: [
      {name: 'Dalton Schultz', team: 'HOU'},
      {name: 'AJ Barner', team: 'SEA'},
      {name: 'Colby Parkinson', team: 'LAR'},
      {name: 'Oronde Gadsden II', team: 'MIA'},
      {name: 'Darren Waller', team: 'NYG'},
      {name: 'Dawson Knox', team: 'BUF'},
      {name: 'Mark Andrews', team: 'BAL'},
      {name: 'Michael Mayer', team: 'LV'},
      {name: 'Theo Johnson', team: 'NYG'},
      {name: 'Chig Okonkwo', team: 'TEN'},
      {name: 'Cade Otton', team: 'TB'}
    ],
    2: [
      {name: 'Mike Gesicki', team: 'CIN'},
      {name: 'Pat Freiermuth', team: 'PIT'},
      {name: 'Evan Engram', team: 'JAX'},
      {name: 'TJ Hockenson', team: 'MIN'},
      {name: 'Josh Oliver', team: 'MIN'},
      {name: 'Isaiah Likely', team: 'BAL'},
      {name: 'Jake Tonges', team: 'CHI'},
      {name: 'Ben Sinnott', team: 'WAS'},
      {name: 'Cole Kmet', team: 'CHI'},
      {name: 'Taysom Hill', team: 'NO'}
    ],
    1: [
      {name: 'Daniel Bellinger', team: 'NYG'},
      {name: 'Luke Schoonmaker', team: 'DAL'},
      {name: 'Luke Musgrave', team: 'GB'},
      {name: 'Noah Fant', team: 'SEA'},
      {name: 'Jonnu Smith', team: 'MIA'},
      {name: 'John Bates', team: 'WAS'},
      {name: 'Terrance Ferguson', team: 'LV'},
      {name: 'Greg Dulcich', team: 'DEN'}
    ]
  }
};

const generatePlayerBoard = (contestType) => {
  const board = [];
  const prices = [5, 4, 3, 2, 1];
  const positions = ['QB', 'RB', 'WR', 'TE'];
  
  // Generate rows 0-4 (prices 5-1) with position-specific players
  prices.forEach((price, rowIndex) => {
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
    // CRITICAL: For row 0 ($5 row), only allow RB and WR (no TE)
    const flexPositions = (rowIndex === 0) ? ['RB', 'WR'] : ['RB', 'WR', 'TE'];
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