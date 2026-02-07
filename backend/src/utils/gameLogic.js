// backend/src/utils/gameLogic.js
// Multi-sport support: NFL and NBA
// NFL: Original complex board with special wildcard rules
// NBA: Simpler board - each column is one position, wildcards match column

// ============================================================
// NFL CONFIGURATION (UNCHANGED)
// ============================================================

const NFL_MATCHUPS = {
  // Wild Card Weekend Teams
  LAR: { opp: 'CAR', home: false },
  CAR: { opp: 'LAR', home: true },
  GB: { opp: 'CHI', home: false },
  CHI: { opp: 'GB', home: true },
  JAX: { opp: 'BUF', home: true },
  BUF: { opp: 'JAX', home: false },
  PHI: { opp: 'SF', home: true },
  SF: { opp: 'PHI', home: false },
  NE: { opp: 'LAC', home: true },
  LAC: { opp: 'NE', home: false },
  PIT: { opp: 'HOU', home: true },
  HOU: { opp: 'PIT', home: false },
  // BYE teams
  DAL: { opp: 'BYE', home: true },
  CLE: { opp: 'BYE', home: true },
  NYJ: { opp: 'BYE', home: true },
  LV: { opp: 'BYE', home: true },
  SEA: { opp: 'BYE', home: true },
  ARI: { opp: 'BYE', home: true },
  DET: { opp: 'BYE', home: true },
  MIA: { opp: 'BYE', home: true },
};

const NFL_PLAYER_POOLS = {
  QB: {
    5: [
      {name: 'Josh Allen', team: 'BUF'},
      {name: 'Drake Maye', team: 'NE'}
    ],
    4: [
      {name: 'Matthew Stafford', team: 'LAR'},
      {name: 'Caleb Williams', team: 'CHI'},
      {name: 'Jalen Hurts', team: 'PHI'},
      {name: 'Trevor Lawrence', team: 'JAX'}
    ],
    3: [
      {name: 'Justin Herbert', team: 'LAC'},
      {name: 'Brock Purdy', team: 'SF'}
    ],
    2: [
      {name: 'Jordan Love', team: 'GB'},
      {name: 'C.J. Stroud', team: 'HOU'}
    ],
    1: [
      {name: 'Bryce Young', team: 'CAR'},
      {name: 'Aaron Rodgers', team: 'PIT'}
    ]
  },
  RB: {
    5: [
      {name: 'Kyren Williams', team: 'LAR'},
      {name: 'James Cook', team: 'BUF'},
      {name: 'Christian McCaffrey', team: 'SF'}
    ],
    4: [
      {name: 'Travis Etienne', team: 'JAX'},
      {name: 'Saquon Barkley', team: 'PHI'},
      {name: 'TreVeyon Henderson', team: 'NE'},
      {name: 'Omarion Hampton', team: 'LAC'}
    ],
    3: [
      {name: "De'Andre Swift", team: 'CHI'},
      {name: 'Josh Jacobs', team: 'GB'},
      {name: 'Rhamondre Stevenson', team: 'NE'},
      {name: 'Kenny Gainwell', team: 'PIT'},
      {name: 'Woody Marks', team: 'HOU'}
    ],
    2: [
      {name: 'Rico Dowdle', team: 'CAR'},
      {name: 'Blake Corum', team: 'LAR'},
      {name: 'Kyle Monangai', team: 'CHI'},
      {name: 'Jaylen Warren', team: 'PIT'}
    ],
    1: [
      {name: 'Chuba Hubbard', team: 'CAR'},
      {name: 'Emmanuel Wilson', team: 'GB'},
      {name: 'Bhayshul Tuten', team: 'JAX'},
      {name: 'Ray Davis', team: 'BUF'},
      {name: 'Ty Johnson', team: 'BUF'},
      {name: 'Tank Bigsby', team: 'PHI'},
      {name: 'Nick Chubb', team: 'HOU'}
    ]
  },
  WR: {
    5: [
      {name: 'Puka Nacua', team: 'LAR'},
      {name: 'Nico Collins', team: 'HOU'}
    ],
    4: [
      {name: 'Davante Adams', team: 'LAR'},
      {name: 'AJ Brown', team: 'PHI'},
      {name: 'DeVonta Smith', team: 'PHI'},
      {name: 'Stefon Diggs', team: 'HOU'},
      {name: 'DK Metcalf', team: 'PIT'},
      {name: 'Rome Odunze', team: 'CHI'},
      {name: 'Christian Watson', team: 'GB'}
    ],
    3: [
      {name: 'Tetairoa McMillan', team: 'CAR'},
      {name: 'Jakobi Meyers', team: 'JAX'},
      {name: 'Brian Thomas Jr.', team: 'JAX'},
      {name: 'Parker Washington', team: 'JAX'},
      {name: 'Ladd McConkey', team: 'LAC'},
      {name: 'Quentin Johnston', team: 'LAC'},
      {name: 'Luther Burden III', team: 'CHI'}
    ],
    2: [
      {name: 'Jalen Coker', team: 'CAR'},
      {name: 'Khalil Shakir', team: 'BUF'},
      {name: 'Jauan Jennings', team: 'SF'},
      {name: 'Ricky Pearsall', team: 'SF'},
      {name: 'Kayshon Boutte', team: 'NE'},
      {name: 'Keenan Allen', team: 'LAC'},
      {name: 'Jayden Higgins', team: 'HOU'},
      {name: 'DJ Moore', team: 'CHI'},
      {name: 'Romeo Doubs', team: 'GB'},
      {name: 'Jayden Reed', team: 'GB'}
    ],
    1: [
      {name: 'Xavier Legette', team: 'CAR'},
      {name: 'Jordan Whittington', team: 'LAR'},
      {name: 'Keon Coleman', team: 'BUF'},
      {name: 'Brandin Cooks', team: 'BUF'},
      {name: 'Joshua Palmer', team: 'BUF'},
      {name: 'Kyle Williams', team: 'NE'},
      {name: 'Calvin Austin III', team: 'PIT'},
      {name: 'Jaylin Noel', team: 'HOU'},
      {name: 'Dontayvion Wicks', team: 'GB'}
    ]
  },
  TE: {
    5: [
      {name: 'George Kittle', team: 'SF'}
    ],
    4: [
      {name: 'Colston Loveland', team: 'CHI'},
      {name: 'Brenton Strange', team: 'JAX'},
      {name: 'Dallas Goedert', team: 'PHI'}
    ],
    3: [
      {name: 'Dalton Kincaid', team: 'BUF'},
      {name: 'Hunter Henry', team: 'NE'}
    ],
    2: [
      {name: 'Colby Parkinson', team: 'LAR'},
      {name: 'Tyler Higbee', team: 'LAR'},
      {name: 'Dawson Knox', team: 'BUF'},
      {name: 'Oronde Gadsden', team: 'JAX'},
      {name: 'Pat Freiermuth', team: 'PIT'},
      {name: 'Dalton Schultz', team: 'HOU'}
    ],
    1: [
      {name: 'Tommy Tremble', team: 'CAR'},
      {name: 'Luke Musgrave', team: 'GB'},
      {name: 'Cole Kmet', team: 'CHI'},
      {name: 'Jonnu Smith', team: 'PIT'}
    ]
  }
};

// ============================================================
// NBA CONFIGURATION
// ============================================================

const NBA_MATCHUPS = {
  // Update with real slate matchups
  LAL: { opp: 'BOS', home: true },
  BOS: { opp: 'LAL', home: false },
  GSW: { opp: 'PHX', home: true },
  PHX: { opp: 'GSW', home: false },
  MIL: { opp: 'MIA', home: true },
  MIA: { opp: 'MIL', home: false },
  DEN: { opp: 'DAL', home: true },
  DAL: { opp: 'DEN', home: false },
  PHI: { opp: 'NYK', home: true },
  NYK: { opp: 'PHI', home: false },
  CLE: { opp: 'OKC', home: true },
  OKC: { opp: 'CLE', home: false },
  MIN: { opp: 'SAC', home: true },
  SAC: { opp: 'MIN', home: false },
  MEM: { opp: 'NOP', home: true },
  NOP: { opp: 'MEM', home: false },
  ATL: { opp: 'CHI', home: true },
  CHI: { opp: 'ATL', home: false },
  IND: { opp: 'TOR', home: true },
  TOR: { opp: 'IND', home: false },
  CHA: { opp: 'DET', home: true },
  DET: { opp: 'CHA', home: false },
  HOU: { opp: 'SAS', home: true },
  SAS: { opp: 'HOU', home: false },
  POR: { opp: 'UTA', home: true },
  UTA: { opp: 'POR', home: false },
  WAS: { opp: 'ORL', home: true },
  ORL: { opp: 'WAS', home: false },
  BKN: { opp: 'LAC', home: true },
  LAC: { opp: 'BKN', home: false },
};

const NBA_PLAYER_POOLS = {
  PG: {
    5: [
      {name: 'Luka Doncic', team: 'DAL'},
      {name: 'Shai Gilgeous-Alexander', team: 'OKC'},
      {name: 'Trae Young', team: 'ATL'}
    ],
    4: [
      {name: 'Tyrese Haliburton', team: 'IND'},
      {name: 'Ja Morant', team: 'MEM'},
      {name: 'De\'Aaron Fox', team: 'SAC'},
      {name: 'Jalen Brunson', team: 'NYK'}
    ],
    3: [
      {name: 'Damian Lillard', team: 'MIL'},
      {name: 'LaMelo Ball', team: 'CHA'},
      {name: 'Darius Garland', team: 'CLE'},
      {name: 'Cade Cunningham', team: 'DET'}
    ],
    2: [
      {name: 'Fred VanVleet', team: 'HOU'},
      {name: 'Tyus Jones', team: 'PHX'},
      {name: 'Dennis Schroder', team: 'BKN'},
      {name: 'Dejounte Murray', team: 'NOP'}
    ],
    1: [
      {name: 'Mike Conley', team: 'MIN'},
      {name: 'Kyle Lowry', team: 'PHI'},
      {name: 'Jose Alvarado', team: 'NOP'},
      {name: 'Marcus Smart', team: 'MEM'}
    ]
  },
  SG: {
    5: [
      {name: 'Devin Booker', team: 'PHX'},
      {name: 'Donovan Mitchell', team: 'CLE'},
      {name: 'Anthony Edwards', team: 'MIN'}
    ],
    4: [
      {name: 'Jaylen Brown', team: 'BOS'},
      {name: 'Zach LaVine', team: 'CHI'},
      {name: 'Desmond Bane', team: 'MEM'},
      {name: 'Tyler Herro', team: 'MIA'}
    ],
    3: [
      {name: 'CJ McCollum', team: 'NOP'},
      {name: 'Anfernee Simons', team: 'POR'},
      {name: 'Jalen Green', team: 'HOU'},
      {name: 'Bogdan Bogdanovic', team: 'ATL'}
    ],
    2: [
      {name: 'Austin Reaves', team: 'LAL'},
      {name: 'Malik Monk', team: 'SAC'},
      {name: 'Derrick White', team: 'BOS'},
      {name: 'Coby White', team: 'CHI'}
    ],
    1: [
      {name: 'Bones Hyland', team: 'LAC'},
      {name: 'Cam Thomas', team: 'BKN'},
      {name: 'Quentin Grimes', team: 'DET'},
      {name: 'Jaden Ivey', team: 'DET'}
    ]
  },
  SF: {
    5: [
      {name: 'LeBron James', team: 'LAL'},
      {name: 'Kevin Durant', team: 'PHX'},
      {name: 'Jayson Tatum', team: 'BOS'}
    ],
    4: [
      {name: 'Jimmy Butler', team: 'MIA'},
      {name: 'Paul George', team: 'PHI'},
      {name: 'Kawhi Leonard', team: 'LAC'},
      {name: 'Brandon Ingram', team: 'NOP'}
    ],
    3: [
      {name: 'Mikal Bridges', team: 'NYK'},
      {name: 'OG Anunoby', team: 'NYK'},
      {name: 'Michael Porter Jr.', team: 'DEN'},
      {name: 'Franz Wagner', team: 'ORL'}
    ],
    2: [
      {name: 'Cam Johnson', team: 'BKN'},
      {name: 'Dillon Brooks', team: 'HOU'},
      {name: 'Andrew Wiggins', team: 'GSW'},
      {name: 'Herbert Jones', team: 'NOP'}
    ],
    1: [
      {name: 'Dorian Finney-Smith', team: 'LAL'},
      {name: 'Jalen Johnson', team: 'ATL'},
      {name: 'Ausar Thompson', team: 'DET'},
      {name: 'Tari Eason', team: 'HOU'}
    ]
  },
  PF: {
    5: [
      {name: 'Giannis Antetokounmpo', team: 'MIL'},
      {name: 'Anthony Davis', team: 'LAL'},
      {name: 'Scottie Barnes', team: 'TOR'}
    ],
    4: [
      {name: 'Pascal Siakam', team: 'IND'},
      {name: 'Evan Mobley', team: 'CLE'},
      {name: 'Lauri Markkanen', team: 'UTA'},
      {name: 'Jaren Jackson Jr.', team: 'MEM'}
    ],
    3: [
      {name: 'Julius Randle', team: 'MIN'},
      {name: 'Jabari Smith Jr.', team: 'HOU'},
      {name: 'Keegan Murray', team: 'SAC'},
      {name: 'Jalen Williams', team: 'OKC'}
    ],
    2: [
      {name: 'Kyle Kuzma', team: 'WAS'},
      {name: 'Jonathan Kuminga', team: 'GSW'},
      {name: 'Jerami Grant', team: 'POR'},
      {name: 'John Collins', team: 'UTA'}
    ],
    1: [
      {name: 'Draymond Green', team: 'GSW'},
      {name: 'Aaron Gordon', team: 'DEN'},
      {name: 'Tobias Harris', team: 'DET'},
      {name: 'Onyeka Okongwu', team: 'ATL'}
    ]
  },
  C: {
    5: [
      {name: 'Nikola Jokic', team: 'DEN'},
      {name: 'Joel Embiid', team: 'PHI'},
      {name: 'Victor Wembanyama', team: 'SAS'}
    ],
    4: [
      {name: 'Domantas Sabonis', team: 'SAC'},
      {name: 'Bam Adebayo', team: 'MIA'},
      {name: 'Karl-Anthony Towns', team: 'NYK'},
      {name: 'Chet Holmgren', team: 'OKC'}
    ],
    3: [
      {name: 'Rudy Gobert', team: 'MIN'},
      {name: 'Alperen Sengun', team: 'HOU'},
      {name: 'Jarrett Allen', team: 'CLE'},
      {name: 'Myles Turner', team: 'IND'}
    ],
    2: [
      {name: 'Brook Lopez', team: 'MIL'},
      {name: 'Mitchell Robinson', team: 'NYK'},
      {name: 'Jonas Valanciunas', team: 'WAS'},
      {name: 'Nikola Vucevic', team: 'CHI'}
    ],
    1: [
      {name: 'Isaiah Hartenstein', team: 'OKC'},
      {name: 'Ivica Zubac', team: 'LAC'},
      {name: 'Daniel Gafford', team: 'DAL'},
      {name: 'Mark Williams', team: 'CHA'}
    ]
  }
};

// Position arrays
const NFL_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'FLEX'];
const NBA_POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'];

// Legacy exports for backward compatibility
const PLAYER_POOLS = NFL_PLAYER_POOLS;
const WEEK_MATCHUPS = NFL_MATCHUPS;

// ============================================================
// HELPER FUNCTIONS
// ============================================================

const getMatchupString = (team, sport = 'nfl') => {
  const matchups = sport === 'nba' ? NBA_MATCHUPS : NFL_MATCHUPS;
  const matchup = matchups[team];
  if (!matchup || matchup.opp === 'BYE') return 'BYE';
  return matchup.home ? `vs ${matchup.opp}` : `@ ${matchup.opp}`;
};

// ============================================================
// NFL BOARD GENERATION (ORIGINAL - UNCHANGED)
// ============================================================

const generateNFLBoard = (contestType, fireSaleList = [], coolDownList = []) => {
  const board = [];
  const prices = [5, 4, 3, 2, 1];
  const positions = ['QB', 'RB', 'WR', 'TE'];
  
  // Create sets for quick lookup
  const fireSaleNames = new Set(fireSaleList.map(p => p.name?.toLowerCase()));
  const coolDownNames = new Set(coolDownList.map(p => p.name?.toLowerCase()));
  
  console.log('🏈 Generating NFL board');
  console.log('🔥 Fire Sale players:', Array.from(fireSaleNames));
  console.log('❄️ Cool Down players:', Array.from(coolDownNames));
  
  // Helper: Select player with Fire Sale boost and Cool Down penalty
  // NOTE: Players CAN appear multiple times on the board - this creates interesting game theory
  const selectWeightedPlayer = (pool, position, price) => {
    if (!pool || pool.length === 0) return null;
    
    // Build weighted pool
    const weightedPool = [];
    pool.forEach(player => {
      const playerNameLower = player.name?.toLowerCase();
      let weight = 1;
      
      // Fire Sale: 3x boost
      if (fireSaleNames.has(playerNameLower)) {
        weight = 3;
      }
      // Cool Down: 1/10 probability
      else if (coolDownNames.has(playerNameLower)) {
        weight = 0.1;
      }
      
      // Add player to weighted pool (multiply entries by weight * 10 to handle decimals)
      const entries = Math.round(weight * 10);
      for (let i = 0; i < entries; i++) {
        weightedPool.push(player);
      }
    });
    
    if (weightedPool.length === 0) {
      // Fallback to random if weighted pool is empty
      return pool[Math.floor(Math.random() * pool.length)];
    }
    
    const selected = weightedPool[Math.floor(Math.random() * weightedPool.length)];
    return selected;
  };
  
  // Generate rows 0-4 (prices 5-1) with position-specific players
  prices.forEach((price, rowIndex) => {
    const row = [];
    positions.forEach(position => {
      const pool = NFL_PLAYER_POOLS[position][price] || [];
      
      if (pool.length > 0) {
        const selectedPlayer = selectWeightedPlayer(pool, position, price);
        if (selectedPlayer) {
          const isFireSale = fireSaleNames.has(selectedPlayer.name?.toLowerCase());
          const isCoolDown = coolDownNames.has(selectedPlayer.name?.toLowerCase());
          
          row.push({
            ...selectedPlayer,
            position: position,
            price: price,
            drafted: false,
            draftedBy: null,
            isFireSale: isFireSale,
            isCoolDown: isCoolDown
          });
        }
      }
    });
    
    // Add FLEX position (5th column) for rows 0-4
    // CRITICAL: For row 0 ($5 row), only allow RB and WR (no TE)
    const flexPositions = (rowIndex === 0) ? ['RB', 'WR'] : ['RB', 'WR', 'TE'];
    const flexPos = flexPositions[Math.floor(Math.random() * flexPositions.length)];
    const flexPool = NFL_PLAYER_POOLS[flexPos][price] || [];
    
    if (flexPool.length > 0) {
      const flexPlayer = selectWeightedPlayer(flexPool, flexPos, price);
      if (flexPlayer) {
        const isFireSale = fireSaleNames.has(flexPlayer.name?.toLowerCase());
        const isCoolDown = coolDownNames.has(flexPlayer.name?.toLowerCase());
        
        row.push({
          ...flexPlayer,
          position: 'FLEX',
          originalPosition: flexPos,
          price: price,
          drafted: false,
          draftedBy: null,
          isFireSale: isFireSale,
          isCoolDown: isCoolDown
        });
      }
    }
    
    board.push(row);
  });

  // Add row 5 (bottom row - Wildcards) with mixed prices
  const flexRow = [];
  
  // Position 0 (bottom-left) is always a QB
  const qbPrice = prices[Math.floor(Math.random() * prices.length)];
  const qbPool = NFL_PLAYER_POOLS['QB'][qbPrice] || [];
  if (qbPool.length > 0) {
    const qbPlayer = selectWeightedPlayer(qbPool, 'QB', qbPrice);
    if (qbPlayer) {
      const isFireSale = fireSaleNames.has(qbPlayer.name?.toLowerCase());
      const isCoolDown = coolDownNames.has(qbPlayer.name?.toLowerCase());
      
      flexRow.push({
        ...qbPlayer,
        position: 'FLEX',
        originalPosition: 'QB',
        price: qbPrice,
        drafted: false,
        draftedBy: null,
        isFireSale: isFireSale,
        isCoolDown: isCoolDown
      });
    }
  }
  
  // Positions 1-3 in Wildcards row are random RB/WR/TE
  for (let i = 1; i < 4; i++) {
    const flexPositions = ['RB', 'WR', 'TE'];
    const pos = flexPositions[Math.floor(Math.random() * flexPositions.length)];
    const price = prices[Math.floor(Math.random() * prices.length)];
    const pool = NFL_PLAYER_POOLS[pos][price] || [];
    
    if (pool.length > 0) {
      const player = selectWeightedPlayer(pool, pos, price);
      if (player) {
        const isFireSale = fireSaleNames.has(player.name?.toLowerCase());
        const isCoolDown = coolDownNames.has(player.name?.toLowerCase());
        
        flexRow.push({
          ...player,
          position: 'FLEX',
          originalPosition: pos,
          price: price,
          drafted: false,
          draftedBy: null,
          isFireSale: isFireSale,
          isCoolDown: isCoolDown
        });
      }
    }
  }
  
  // Position 4 (bottom-right) MUST be a WR stacked with one of the 6 QBs
  // Collect all QB teams: 5 from QB column + 1 from wildcard position 0
  const qbTeams = new Set();
  for (let row = 0; row < 5; row++) {
    if (board[row][0]?.team) qbTeams.add(board[row][0].team);
  }
  if (flexRow[0]?.team) qbTeams.add(flexRow[0].team);
  
  console.log('🏈 QB teams for stacking:', Array.from(qbTeams));
  
  // Find all WRs that match a QB team
  const stackableWRs = [];
  Object.entries(NFL_PLAYER_POOLS.WR).forEach(([priceStr, players]) => {
    const price = parseInt(priceStr);
    players.forEach(player => {
      if (qbTeams.has(player.team)) {
        stackableWRs.push({ ...player, price });
      }
    });
  });
  
  if (stackableWRs.length > 0) {
    // Apply weighting for Fire Sale / Cool Down
    const weightedStackable = [];
    stackableWRs.forEach(player => {
      const playerNameLower = player.name?.toLowerCase();
      let weight = 1;
      if (fireSaleNames.has(playerNameLower)) weight = 3;
      else if (coolDownNames.has(playerNameLower)) weight = 0.1;
      
      const entries = Math.round(weight * 10);
      for (let i = 0; i < entries; i++) {
        weightedStackable.push(player);
      }
    });
    
    const stackedWR = weightedStackable[Math.floor(Math.random() * weightedStackable.length)];
    const isFireSale = fireSaleNames.has(stackedWR.name?.toLowerCase());
    const isCoolDown = coolDownNames.has(stackedWR.name?.toLowerCase());
    
    flexRow.push({
      ...stackedWR,
      position: 'FLEX',
      originalPosition: 'WR',
      drafted: false,
      draftedBy: null,
      isFireSale: isFireSale,
      isCoolDown: isCoolDown,
      isStackedWR: true
    });
    console.log(`✅ Stacked WR: ${stackedWR.name} (${stackedWR.team}) at $${stackedWR.price}`);
  } else {
    // Fallback: random WR if no stackable found
    console.log('⚠️ No stackable WR found, using random WR');
    const price = prices[Math.floor(Math.random() * prices.length)];
    const pool = NFL_PLAYER_POOLS.WR[price] || [];
    if (pool.length > 0) {
      const player = selectWeightedPlayer(pool, 'WR', price);
      if (player) {
        const isFireSale = fireSaleNames.has(player.name?.toLowerCase());
        const isCoolDown = coolDownNames.has(player.name?.toLowerCase());
        
        flexRow.push({
          ...player,
          position: 'FLEX',
          originalPosition: 'WR',
          price: price,
          drafted: false,
          draftedBy: null,
          isFireSale: isFireSale,
          isCoolDown: isCoolDown
        });
      }
    }
  }
  
  board.push(flexRow);

  // Ensure at least one RB in flex spots
  const flexSpots = [];
  for (let row = 0; row < 5; row++) {
    if (board[row][4]) flexSpots.push({ row, col: 4 });
  }
  for (let col = 1; col < 5; col++) {
    if (board[5] && board[5][col]) flexSpots.push({ row: 5, col });
  }

  const hasRBInFlex = flexSpots.some(spot => 
    board[spot.row][spot.col]?.originalPosition === 'RB'
  );

  if (!hasRBInFlex && flexSpots.length > 0) {
    const spotToReplace = flexSpots[Math.floor(Math.random() * flexSpots.length)];
    const price = board[spotToReplace.row][spotToReplace.col].price;
    const rbPool = NFL_PLAYER_POOLS['RB'][price] || [];
    
    if (rbPool.length > 0) {
      const rbPlayer = selectWeightedPlayer(rbPool, 'RB', price);
      if (rbPlayer) {
        const isFireSale = fireSaleNames.has(rbPlayer.name?.toLowerCase());
        const isCoolDown = coolDownNames.has(rbPlayer.name?.toLowerCase());
        
        board[spotToReplace.row][spotToReplace.col] = {
          ...rbPlayer,
          position: 'FLEX',
          originalPosition: 'RB',
          price: price,
          drafted: false,
          draftedBy: null,
          isFireSale: isFireSale,
          isCoolDown: isCoolDown
        };
      }
    }
  }

  // FIRE SALE GUARANTEE: Ensure at least 1 Fire Sale player on board
  if (fireSaleList.length > 0) {
    let fireSaleCount = 0;
    board.forEach(row => {
      row.forEach(player => {
        if (player && player.isFireSale) fireSaleCount++;
      });
    });
    
    console.log(`🔥 Fire Sale players on board: ${fireSaleCount}`);
    
    // If no Fire Sale players, force one onto the board
    if (fireSaleCount === 0) {
      console.log('⚠️ No Fire Sale players on board - forcing one...');
      
      // Pick a random Fire Sale player
      const randomFireSale = fireSaleList[Math.floor(Math.random() * fireSaleList.length)];
      const fsPosition = randomFireSale.position || 'WR';
      const fsPrice = randomFireSale.price || 3;
      
      // Find a spot to replace (prefer matching position)
      let replaced = false;
      
      // Try to find matching position in the price row
      const priceRow = 5 - fsPrice; // $5 = row 0, $4 = row 1, etc.
      if (priceRow >= 0 && priceRow < 5) {
        const positionCols = { QB: 0, RB: 1, WR: 2, TE: 3, FLEX: 4 };
        const col = positionCols[fsPosition];
        
        if (col !== undefined && board[priceRow][col] && !board[priceRow][col].isFireSale) {
          board[priceRow][col] = {
            name: randomFireSale.name,
            team: randomFireSale.team,
            position: fsPosition,
            price: fsPrice,
            drafted: false,
            draftedBy: null,
            isFireSale: true,
            isCoolDown: false,
            forcedFireSale: true
          };
          replaced = true;
          console.log(`✅ Forced ${randomFireSale.name} into row ${priceRow}, col ${col}`);
        }
      }
      
      // Fallback: replace a random non-Fire Sale player
      if (!replaced) {
        for (let r = 0; r < board.length && !replaced; r++) {
          for (let c = 0; c < board[r].length && !replaced; c++) {
            if (board[r][c] && !board[r][c].isFireSale && board[r][c].position !== 'FLEX') {
              board[r][c] = {
                name: randomFireSale.name,
                team: randomFireSale.team,
                position: board[r][c].position,
                originalPosition: fsPosition,
                price: board[r][c].price,
                drafted: false,
                draftedBy: null,
                isFireSale: true,
                isCoolDown: false,
                forcedFireSale: true
              };
              replaced = true;
              console.log(`✅ Forced ${randomFireSale.name} into row ${r}, col ${c} (fallback)`);
            }
          }
        }
      }
    }
  }

  // Add matchup info to all players
  board.forEach(row => {
    row.forEach(player => {
      if (player && player.team) {
        player.matchup = getMatchupString(player.team, 'nfl');
      }
    });
  });

  // Log board summary
  console.log('📋 NFL Board generated:');
  board.forEach((row, i) => {
    const label = i === 5 ? 'Wildcards' : `$${5 - i}`;
    console.log(`  ${label}: ${row.length} players`);
  });

  return board;
};

// ============================================================
// NBA BOARD GENERATION (NEW - SIMPLER STRUCTURE)
// ============================================================

const generateNBABoard = (contestType, fireSaleList = [], coolDownList = []) => {
  const board = [];
  const prices = [5, 4, 3, 2, 1];
  const positions = NBA_POSITIONS; // ['PG', 'SG', 'SF', 'PF', 'C']
  
  // Create sets for quick lookup
  const fireSaleNames = new Set(fireSaleList.map(p => p.name?.toLowerCase()));
  const coolDownNames = new Set(coolDownList.map(p => p.name?.toLowerCase()));
  
  console.log('🏀 Generating NBA board');
  console.log('🔥 Fire Sale players:', Array.from(fireSaleNames));
  console.log('❄️ Cool Down players:', Array.from(coolDownNames));
  
  // Helper: Select player with Fire Sale boost and Cool Down penalty
  const selectWeightedPlayer = (pool) => {
    if (!pool || pool.length === 0) return null;
    
    const weightedPool = [];
    pool.forEach(player => {
      const playerNameLower = player.name?.toLowerCase();
      let weight = 1;
      
      if (fireSaleNames.has(playerNameLower)) {
        weight = 3;
      } else if (coolDownNames.has(playerNameLower)) {
        weight = 0.1;
      }
      
      const entries = Math.round(weight * 10);
      for (let i = 0; i < entries; i++) {
        weightedPool.push(player);
      }
    });
    
    if (weightedPool.length === 0) {
      return pool[Math.floor(Math.random() * pool.length)];
    }
    
    return weightedPool[Math.floor(Math.random() * weightedPool.length)];
  };
  
  // Generate rows 0-4 (prices $5-$1)
  // Each column is a fixed position: PG, SG, SF, PF, C
  prices.forEach((price) => {
    const row = [];
    
    positions.forEach((position) => {
      const pool = NBA_PLAYER_POOLS[position][price] || [];
      
      if (pool.length > 0) {
        const selectedPlayer = selectWeightedPlayer(pool);
        if (selectedPlayer) {
          const isFireSale = fireSaleNames.has(selectedPlayer.name?.toLowerCase());
          const isCoolDown = coolDownNames.has(selectedPlayer.name?.toLowerCase());
          
          row.push({
            ...selectedPlayer,
            position: position,
            price: price,
            drafted: false,
            draftedBy: null,
            isFireSale: isFireSale,
            isCoolDown: isCoolDown
          });
        }
      } else {
        // Fallback: create placeholder if pool is empty
        row.push({
          name: `${position} $${price}`,
          team: 'TBD',
          position: position,
          price: price,
          drafted: false,
          draftedBy: null,
          isFireSale: false,
          isCoolDown: false
        });
      }
    });
    
    board.push(row);
  });

  // Row 5 (Wildcards): Same positions as columns, but random prices
  // This ensures every position always has 6 choices
  const wildcardRow = [];
  
  positions.forEach((position) => {
    const randomPrice = prices[Math.floor(Math.random() * prices.length)];
    const pool = NBA_PLAYER_POOLS[position][randomPrice] || [];
    
    if (pool.length > 0) {
      const selectedPlayer = selectWeightedPlayer(pool);
      if (selectedPlayer) {
        const isFireSale = fireSaleNames.has(selectedPlayer.name?.toLowerCase());
        const isCoolDown = coolDownNames.has(selectedPlayer.name?.toLowerCase());
        
        wildcardRow.push({
          ...selectedPlayer,
          position: position, // Keep same position as column
          price: randomPrice,
          drafted: false,
          draftedBy: null,
          isFireSale: isFireSale,
          isCoolDown: isCoolDown,
          isWildcard: true
        });
      }
    } else {
      // Fallback
      wildcardRow.push({
        name: `${position} Wildcard`,
        team: 'TBD',
        position: position,
        price: randomPrice,
        drafted: false,
        draftedBy: null,
        isFireSale: false,
        isCoolDown: false,
        isWildcard: true
      });
    }
  });
  
  board.push(wildcardRow);

  // FIRE SALE GUARANTEE for NBA
  if (fireSaleList.length > 0) {
    let fireSaleCount = 0;
    board.forEach(row => {
      row.forEach(player => {
        if (player && player.isFireSale) fireSaleCount++;
      });
    });
    
    console.log(`🔥 Fire Sale players on board: ${fireSaleCount}`);
    
    if (fireSaleCount === 0) {
      console.log('⚠️ No Fire Sale players on board - forcing one...');
      
      const randomFireSale = fireSaleList[Math.floor(Math.random() * fireSaleList.length)];
      const fsPosition = randomFireSale.position || 'SF';
      const fsPrice = randomFireSale.price || 3;
      
      const priceRow = 5 - fsPrice;
      const positionCol = positions.indexOf(fsPosition);
      
      if (priceRow >= 0 && priceRow < 5 && positionCol >= 0) {
        board[priceRow][positionCol] = {
          name: randomFireSale.name,
          team: randomFireSale.team,
          position: fsPosition,
          price: fsPrice,
          drafted: false,
          draftedBy: null,
          isFireSale: true,
          isCoolDown: false,
          forcedFireSale: true
        };
        console.log(`✅ Forced ${randomFireSale.name} into row ${priceRow}, col ${positionCol}`);
      }
    }
  }

  // Add matchup info to all players
  board.forEach(row => {
    row.forEach(player => {
      if (player && player.team) {
        player.matchup = getMatchupString(player.team, 'nba');
      }
    });
  });

  // Log board summary
  console.log('📋 NBA Board generated:');
  board.forEach((row, i) => {
    const label = i === 5 ? 'Wildcards' : `$${5 - i}`;
    const positions = row.map(p => `${p.position}($${p.price})`).join(', ');
    console.log(`  ${label}: ${positions}`);
  });

  return board;
};

// ============================================================
// MAIN BOARD GENERATION FUNCTION
// ============================================================

const generatePlayerBoard = (contestType, fireSaleList = [], coolDownList = [], sport = 'nfl') => {
  if (sport === 'nba') {
    return generateNBABoard(contestType, fireSaleList, coolDownList);
  }
  return generateNFLBoard(contestType, fireSaleList, coolDownList);
};

// ============================================================
// GAME MECHANICS
// ============================================================

const calculateKingpinBonus = (team, newPlayer) => {
  let bonusAdded = 0;
  
  // Check for duplicate player bonus
  const duplicates = team.players.filter(p => 
    p.name === newPlayer.name && p.team === newPlayer.team
  );
  if (duplicates.length === 2) {
    bonusAdded++;
  }
  
  // Check for QB + pass catcher stack (NFL) or PG + scorer stack (NBA)
  const teamLeader = team.players.find(p => 
    (p.position === 'QB' || p.originalPosition === 'QB' ||
     p.position === 'PG' || p.originalPosition === 'PG') && 
    p.team === newPlayer.team
  );
  const isPassCatcher = ['WR', 'TE', 'SG', 'SF'].includes(newPlayer.position) || 
    ['WR', 'TE', 'SG', 'SF'].includes(newPlayer.originalPosition);
  
  if (teamLeader && isPassCatcher) {
    bonusAdded++;
  }
  
  // Or if new player is QB/PG, check for existing pass catchers/scorers
  const isLeader = newPlayer.position === 'QB' || newPlayer.originalPosition === 'QB' ||
                   newPlayer.position === 'PG' || newPlayer.originalPosition === 'PG';
  if (isLeader) {
    const hasPassCatcher = team.players.some(p => 
      p !== newPlayer &&
      p.team === newPlayer.team &&
      (['WR', 'TE', 'SG', 'SF'].includes(p.position) || 
       ['WR', 'TE', 'SG', 'SF'].includes(p.originalPosition))
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

// ============================================================
// SPORT CONFIGURATION EXPORT
// ============================================================

const SPORT_CONFIG = {
  nfl: {
    positions: NFL_POSITIONS,
    playerPools: NFL_PLAYER_POOLS,
    matchups: NFL_MATCHUPS
  },
  nba: {
    positions: NBA_POSITIONS,
    playerPools: NBA_PLAYER_POOLS,
    matchups: NBA_MATCHUPS
  }
};

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  // Sport configs
  SPORT_CONFIG,
  NFL_PLAYER_POOLS,
  NBA_PLAYER_POOLS,
  NFL_MATCHUPS,
  NBA_MATCHUPS,
  NFL_POSITIONS,
  NBA_POSITIONS,
  
  // Legacy exports (backward compatibility)
  PLAYER_POOLS,
  WEEK_MATCHUPS,
  
  // Functions
  getMatchupString,
  generatePlayerBoard,
  generateNFLBoard,
  generateNBABoard,
  calculateKingpinBonus,
  applySkipPenalty
};