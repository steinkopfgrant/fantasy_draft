// backend/src/utils/gameLogic.js
// Multi-sport support: NFL and NBA
// NFL: Original complex board with special wildcard rules
// NBA: Simpler board - each column is one position, wildcards match column

// ============================================================
// NFL CONFIGURATION (UNCHANGED)
// ============================================================

const NFL_MATCHUPS = {
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
// NBA CONFIGURATION - Feb 20, 2026 Slate
// 10 games: CLE@BKN, WAS@IND, PHI@ATL, CHA@HOU, NYK@DET,
//           CHI@TOR, SAS@PHX, SAC@ORL, GSW@BOS, LAC@DEN
// ============================================================

const NBA_MATCHUPS = {
  CLE: { opp: 'BKN', home: false },
  BKN: { opp: 'CLE', home: true },
  WAS: { opp: 'IND', home: false },
  IND: { opp: 'WAS', home: true },
  PHI: { opp: 'ATL', home: false },
  ATL: { opp: 'PHI', home: true },
  CHA: { opp: 'HOU', home: false },
  HOU: { opp: 'CHA', home: true },
  NY: { opp: 'DET', home: false },
  DET: { opp: 'NY', home: true },
  CHI: { opp: 'TOR', home: false },
  TOR: { opp: 'CHI', home: true },
  SA: { opp: 'PHO', home: false },
  PHO: { opp: 'SA', home: true },
  SAC: { opp: 'ORL', home: false },
  ORL: { opp: 'SAC', home: true },
  GS: { opp: 'BOS', home: false },
  BOS: { opp: 'GS', home: true },
  LAC: { opp: 'DEN', home: false },
  DEN: { opp: 'LAC', home: true },
};

const NBA_PLAYER_POOLS = {
  PG: {
    5: [
      {name: 'Tyrese Maxey', team: 'PHI'},
      {name: 'Cade Cunningham', team: 'DET'},
      {name: 'James Harden', team: 'CLE'},
      {name: 'Jamal Murray', team: 'DEN'}
    ],
    4: [
      {name: 'Josh Giddey', team: 'CHI'},
      {name: 'Stephen Curry', team: 'GS'},
      {name: 'Jalen Brunson', team: 'NY'},
      {name: 'LaMelo Ball', team: 'CHA'},
      {name: 'Derrick White', team: 'BOS'}
    ],
    3: [
      {name: "De'Aaron Fox", team: 'SA'},
      {name: 'Trae Young', team: 'WAS'},
      {name: 'Immanuel Quickley', team: 'TOR'},
      {name: 'Stephon Castle', team: 'SA'},
      {name: 'Russell Westbrook', team: 'SAC'},
      {name: 'Andrew Nembhard', team: 'IND'},
      {name: 'Jalen Suggs', team: 'ORL'},
      {name: 'Payton Pritchard', team: 'BOS'},
      {name: 'Darius Garland', team: 'LAC'},
      {name: 'Anthony Black', team: 'ORL'}
    ],
    2: [
      {name: 'Collin Gillespie', team: 'PHO'},
      {name: 'Tre Jones', team: 'CHI'},
      {name: 'Miles McBride', team: 'NY'}
    ],
    1: [
      {name: 'T.J. McConnell', team: 'IND'},
      {name: 'Egor Demin', team: 'BKN'},
      {name: 'Kris Dunn', team: 'LAC'}
    ]
  },
  SG: {
    5: [
      {name: 'Donovan Mitchell', team: 'CLE'},
      {name: 'Jaylen Brown', team: 'BOS'}
    ],
    4: [
      {name: 'Devin Booker', team: 'PHO'},
      {name: 'Alexandre Sarr', team: 'WAS'}
    ],
    3: [
      {name: 'Nickeil Alexander-Walker', team: 'ATL'},
      {name: 'Desmond Bane', team: 'ORL'},
      {name: 'Dyson Daniels', team: 'ATL'},
      {name: 'Kon Knueppel', team: 'CHA'},
      {name: 'VJ Edgecombe', team: 'PHI'},
      {name: 'RJ Barrett', team: 'TOR'},
      {name: 'Josh Hart', team: 'NY'}
    ],
    2: [
      {name: 'Grayson Allen', team: 'PHO'},
      {name: 'CJ McCollum', team: 'ATL'},
      {name: 'Coby White', team: 'CHA'},
      {name: 'Bennedict Mathurin', team: 'LAC'},
      {name: 'Zach LaVine', team: 'SAC'},
      {name: 'Brandin Podziemski', team: 'GS'},
      {name: 'Quentin Grimes', team: 'PHI'},
      {name: 'Devin Vassell', team: 'SA'},
      {name: 'Reed Sheppard', team: 'HOU'}
    ],
    1: [
      {name: 'Collin Sexton', team: 'CHI'},
      {name: 'Anfernee Simons', team: 'CHI'},
      {name: "De'Anthony Melton", team: 'GS'},
      {name: 'Sam Merrill', team: 'CLE'},
      {name: 'Jordan Goodwin', team: 'PHO'},
      {name: 'Moses Moody', team: 'GS'},
      {name: 'Tre Johnson', team: 'WAS'},
      {name: 'Tim Hardaway Jr.', team: 'DEN'},
      {name: 'Malik Monk', team: 'SAC'}
    ]
  },
  SF: {
    5: [
      {name: 'Kawhi Leonard', team: 'LAC'},
      {name: 'Jalen Johnson', team: 'ATL'}
    ],
    4: [
      {name: 'Kevin Durant', team: 'HOU'},
      {name: 'Michael Porter Jr.', team: 'BKN'},
      {name: 'Amen Thompson', team: 'HOU'}
    ],
    3: [
      {name: 'Jimmy Butler III', team: 'GS'},
      {name: 'Brandon Ingram', team: 'TOR'},
      {name: 'Franz Wagner', team: 'ORL'},
      {name: 'Brandon Miller', team: 'CHA'},
      {name: 'Mikal Bridges', team: 'NY'},
      {name: 'Paul George', team: 'PHI'},
      {name: 'OG Anunoby', team: 'NY'},
      {name: 'Kyshawn George', team: 'WAS'},
      {name: 'DeMar DeRozan', team: 'SAC'}
    ],
    2: [
      {name: 'Dillon Brooks', team: 'PHO'},
      {name: 'Matas Buzelis', team: 'CHI'},
      {name: 'Peyton Watson', team: 'DEN'},
      {name: 'Ausar Thompson', team: 'DET'},
      {name: 'Kelly Oubre Jr.', team: 'PHI'},
      {name: 'Jaylon Tyson', team: 'CLE'},
      {name: 'Tari Eason', team: 'HOU'},
      {name: 'Aaron Nesmith', team: 'IND'},
      {name: 'Keldon Johnson', team: 'SA'},
      {name: 'Bilal Coulibaly', team: 'WAS'},
      {name: 'Julian Champagnie', team: 'SA'}
    ],
    1: [
      {name: 'Cameron Johnson', team: 'DEN'},
      {name: 'Derrick Jones Jr.', team: 'LAC'},
      {name: 'Ziaire Williams', team: 'BKN'}
    ]
  },
  PF: {
    5: [
      {name: 'Victor Wembanyama', team: 'SA'}
    ],
    4: [
      {name: 'Scottie Barnes', team: 'TOR'},
      {name: 'Evan Mobley', team: 'CLE'},
      {name: 'Pascal Siakam', team: 'IND'},
      {name: 'Paolo Banchero', team: 'ORL'}
    ],
    3: [
      {name: 'Miles Bridges', team: 'CHA'},
      {name: 'Keegan Murray', team: 'SAC'}
    ],
    2: [
      {name: 'Jabari Smith Jr.', team: 'HOU'},
      {name: 'Aaron Gordon', team: 'DEN'},
      {name: 'Tobias Harris', team: 'DET'},
      {name: 'Draymond Green', team: 'GS'},
      {name: 'John Collins', team: 'LAC'},
      {name: 'Royce O\'Neale', team: 'PHO'},
      {name: 'Noah Clowney', team: 'BKN'},
      {name: 'Sandro Mamukelashvili', team: 'TOR'},
      {name: 'Obi Toppin', team: 'IND'}
    ],
    1: [
      {name: 'Jalen Smith', team: 'CHI'},
      {name: 'Collin Murray-Boyles', team: 'TOR'},
      {name: 'Dominick Barlow', team: 'PHI'}
    ]
  },
  C: {
    5: [
      {name: 'Nikola Jokic', team: 'DEN'}
    ],
    4: [
      {name: 'Alperen Sengun', team: 'HOU'},
      {name: 'Anthony Davis', team: 'WAS'},
      {name: 'Joel Embiid', team: 'PHI'},
      {name: 'Karl-Anthony Towns', team: 'NY'}
    ],
    3: [
      {name: 'Nikola Vucevic', team: 'BOS'},
      {name: 'Domantas Sabonis', team: 'SAC'},
      {name: 'Jalen Duren', team: 'DET'},
      {name: 'Onyeka Okongwu', team: 'ATL'},
      {name: 'Kristaps Porzingis', team: 'GS'},
      {name: 'Ivica Zubac', team: 'IND'},
      {name: 'Jarrett Allen', team: 'CLE'},
      {name: 'Nicolas Claxton', team: 'BKN'}
    ],
    2: [
      {name: 'Mark Williams', team: 'PHO'},
      {name: 'Wendell Carter Jr.', team: 'ORL'},
      {name: 'Neemias Queta', team: 'BOS'},
      {name: 'Moussa Diabate', team: 'CHA'},
      {name: 'Jock Landale', team: 'ATL'}
    ],
    1: [
      {name: 'Jakob Poeltl', team: 'TOR'},
      {name: 'Isaiah Stewart', team: 'DET'},
      {name: "Day'Ron Sharpe", team: 'BKN'},
      {name: 'Dylan Cardwell', team: 'SAC'},
      {name: 'Jay Huff', team: 'IND'},
      {name: 'Mitchell Robinson', team: 'NY'},
      {name: 'Al Horford', team: 'GS'},
      {name: 'Luke Kornet', team: 'SA'},
      {name: 'Ryan Kalkbrenner', team: 'CHA'},
      {name: 'Goga Bitadze', team: 'ORL'}
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
  
  const fireSaleNames = new Set(fireSaleList.map(p => p.name?.toLowerCase()));
  const coolDownNames = new Set(coolDownList.map(p => p.name?.toLowerCase()));
  
  console.log('🏈 Generating NFL board');
  console.log('🔥 Fire Sale players:', Array.from(fireSaleNames));
  console.log('❄️ Cool Down players:', Array.from(coolDownNames));
  
  const selectWeightedPlayer = (pool, position, price) => {
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
    
    const selected = weightedPool[Math.floor(Math.random() * weightedPool.length)];
    return selected;
  };
  
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

  const flexRow = [];
  
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
  
  const qbTeams = new Set();
  for (let row = 0; row < 5; row++) {
    if (board[row][0]?.team) qbTeams.add(board[row][0].team);
  }
  if (flexRow[0]?.team) qbTeams.add(flexRow[0].team);
  
  console.log('🏈 QB teams for stacking:', Array.from(qbTeams));
  
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
      const fsPosition = randomFireSale.position || 'WR';
      const fsPrice = randomFireSale.price || 3;
      
      let replaced = false;
      
      const priceRow = 5 - fsPrice;
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

  board.forEach(row => {
    row.forEach(player => {
      if (player && player.team) {
        player.matchup = getMatchupString(player.team, 'nfl');
      }
    });
  });

  console.log('📋 NFL Board generated:');
  board.forEach((row, i) => {
    const label = i === 5 ? 'Wildcards' : `$${5 - i}`;
    console.log(`  ${label}: ${row.length} players`);
  });

  return board;
};

// ============================================================
// NBA BOARD GENERATION
// ============================================================

const generateNBABoard = (contestType, fireSaleList = [], coolDownList = []) => {
  const board = [];
  const prices = [5, 4, 3, 2, 1];
  const positions = NBA_POSITIONS;
  
  const fireSaleNames = new Set(fireSaleList.map(p => p.name?.toLowerCase()));
  const coolDownNames = new Set(coolDownList.map(p => p.name?.toLowerCase()));
  
  console.log('🏀 Generating NBA board');
  console.log('🔥 Fire Sale players:', Array.from(fireSaleNames));
  console.log('❄️ Cool Down players:', Array.from(coolDownNames));
  
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
          position: position,
          price: randomPrice,
          drafted: false,
          draftedBy: null,
          isFireSale: isFireSale,
          isCoolDown: isCoolDown,
          isWildcard: true
        });
      }
    } else {
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

  board.forEach(row => {
    row.forEach(player => {
      if (player && player.team) {
        player.matchup = getMatchupString(player.team, 'nba');
      }
    });
  });

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
  
  const duplicates = team.players.filter(p => 
    p.name === newPlayer.name && p.team === newPlayer.team
  );
  if (duplicates.length === 2) {
    bonusAdded++;
  }
  
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
  SPORT_CONFIG,
  NFL_PLAYER_POOLS,
  NBA_PLAYER_POOLS,
  NFL_MATCHUPS,
  NBA_MATCHUPS,
  NFL_POSITIONS,
  NBA_POSITIONS,
  
  PLAYER_POOLS,
  WEEK_MATCHUPS,
  
  getMatchupString,
  generatePlayerBoard,
  generateNFLBoard,
  generateNBABoard,
  calculateKingpinBonus,
  applySkipPenalty
};