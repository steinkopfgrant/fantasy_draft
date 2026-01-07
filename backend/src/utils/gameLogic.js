// backend/src/utils/gameLogic.js
// Wild Card Weekend - January 11-12, 2026
// Matchups: Rams @ Panthers, Packers @ Bears, Jaguars vs Bills, Eagles vs 49ers, Patriots vs Chargers, Steelers vs Texans

const WEEK_MATCHUPS = {
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
  // Teams not playing this week (BYE)
  DAL: { opp: 'BYE', home: true },
  CLE: { opp: 'BYE', home: true },
  NYJ: { opp: 'BYE', home: true },
  LV: { opp: 'BYE', home: true },
  SEA: { opp: 'BYE', home: true },
  ARI: { opp: 'BYE', home: true },
  DET: { opp: 'BYE', home: true },
  MIA: { opp: 'BYE', home: true },
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

const generatePlayerBoard = (contestType, fireSaleList = [], coolDownList = []) => {
  const board = [];
  const prices = [5, 4, 3, 2, 1];
  const positions = ['QB', 'RB', 'WR', 'TE'];
  
  // Create sets for quick lookup
  const fireSaleNames = new Set(fireSaleList.map(p => p.name?.toLowerCase()));
  const coolDownNames = new Set(coolDownList.map(p => p.name?.toLowerCase()));
  
  console.log('🔥 Fire Sale players:', Array.from(fireSaleNames));
  console.log('❄️ Cool Down players:', Array.from(coolDownNames));
  
  // Helper: Select player with Fire Sale boost and Cool Down penalty
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
  
  // Track which players we've already placed to avoid duplicates
  const usedPlayers = new Set();
  
  // Generate rows 0-4 (prices 5-1) with position-specific players
  prices.forEach((price, rowIndex) => {
    const row = [];
    positions.forEach(position => {
      const pool = PLAYER_POOLS[position][price] || [];
      // Filter out already used players
      const availablePool = pool.filter(p => !usedPlayers.has(p.name));
      
      if (availablePool.length > 0) {
        const selectedPlayer = selectWeightedPlayer(availablePool, position, price);
        if (selectedPlayer) {
          usedPlayers.add(selectedPlayer.name);
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
    const flexPool = (PLAYER_POOLS[flexPos][price] || []).filter(p => !usedPlayers.has(p.name));
    
    if (flexPool.length > 0) {
      const flexPlayer = selectWeightedPlayer(flexPool, flexPos, price);
      if (flexPlayer) {
        usedPlayers.add(flexPlayer.name);
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
  
  // First position (bottom-left) is always a QB
  const qbPrice = prices[Math.floor(Math.random() * prices.length)];
  const qbPool = (PLAYER_POOLS['QB'][qbPrice] || []).filter(p => !usedPlayers.has(p.name));
  if (qbPool.length > 0) {
    const qbPlayer = selectWeightedPlayer(qbPool, 'QB', qbPrice);
    if (qbPlayer) {
      usedPlayers.add(qbPlayer.name);
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
  
  // Positions 2-4 in Wildcards row are RB/WR/TE
  for (let i = 1; i < 4; i++) {
    const flexPositions = ['RB', 'WR', 'TE'];
    const pos = flexPositions[Math.floor(Math.random() * flexPositions.length)];
    const price = prices[Math.floor(Math.random() * prices.length)];
    const pool = (PLAYER_POOLS[pos][price] || []).filter(p => !usedPlayers.has(p.name));
    
    if (pool.length > 0) {
      const player = selectWeightedPlayer(pool, pos, price);
      if (player) {
        usedPlayers.add(player.name);
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
  
  // Leave bottom-right (position 5) as NULL - filled by ensureStackedWRInBottomRight
  flexRow.push(null);
  
  board.push(flexRow);

  // Ensure at least one RB in flex spots
  const flexSpots = [];
  for (let row = 0; row < 5; row++) {
    if (board[row][4]) flexSpots.push({ row, col: 4 });
  }
  for (let col = 1; col < 4; col++) {
    if (board[5][col]) flexSpots.push({ row: 5, col });
  }

  const hasRBInFlex = flexSpots.some(spot => 
    board[spot.row][spot.col]?.originalPosition === 'RB'
  );

  if (!hasRBInFlex && flexSpots.length > 0) {
    const spotToReplace = flexSpots[Math.floor(Math.random() * flexSpots.length)];
    const price = board[spotToReplace.row][spotToReplace.col].price;
    const rbPool = (PLAYER_POOLS['RB'][price] || []).filter(p => !usedPlayers.has(p.name));
    
    if (rbPool.length > 0) {
      const rbPlayer = selectWeightedPlayer(rbPool, 'RB', price);
      if (rbPlayer) {
        usedPlayers.add(rbPlayer.name);
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