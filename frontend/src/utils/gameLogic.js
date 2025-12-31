// frontend/src/utils/gameLogic.js
// Frontend version - no database imports

// Generate player board for display only
export const generatePlayerBoard = (sport = 'nfl') => {
  const positions = {
    nfl: ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'],
    nba: ['PG', 'SG', 'SF', 'PF', 'C'],
    mlb: ['P', 'C', '1B', '2B', '3B', 'SS', 'OF'],
    nhl: ['C', 'LW', 'RW', 'D', 'G']
  };

  const teams = {
    nfl: ['KC', 'BUF', 'CIN', 'JAX', 'LAC', 'BAL', 'MIA', 'NE', 'CLE', 'PIT', 'HOU', 'IND', 'TEN', 'DEN', 'LV', 'NYJ'],
    nba: ['LAL', 'BOS', 'MIL', 'PHO', 'GSW', 'MIA', 'PHI', 'DAL', 'MEM', 'DEN'],
    mlb: ['NYY', 'HOU', 'LAD', 'ATL', 'NYM', 'SD', 'PHI', 'CLE', 'SEA', 'TB'],
    nhl: ['COL', 'FLA', 'CAR', 'EDM', 'TOR', 'BOS', 'NYR', 'TB', 'DAL', 'VGK']
  };

  const positionList = positions[sport] || positions.nfl;
  const teamList = teams[sport] || teams.nfl;
  const players = [];

  // Generate 150 players
  for (let i = 0; i < 150; i++) {
    const position = positionList[Math.floor(Math.random() * positionList.length)];
    const team = teamList[Math.floor(Math.random() * teamList.length)];
    
    players.push({
      id: `player-${i + 1}`,
      name: `Player ${i + 1}`,
      position,
      team,
      projectedPoints: Math.floor(Math.random() * 30) + 5,
      salary: Math.floor(Math.random() * 5000) + 3000,
      averagePoints: Math.floor(Math.random() * 25) + 5,
      gamesPlayed: Math.floor(Math.random() * 10) + 6,
      injuryStatus: Math.random() > 0.9 ? 'Q' : null
    });
  }

  // Sort by projected points
  players.sort((a, b) => b.projectedPoints - a.projectedPoints);

  return players;
};

// Calculate draft score for display
export const calculateDraftScore = (draftPlayers) => {
  let totalScore = 0;

  for (const player of draftPlayers) {
    // Generate random score for each player
    const playerScore = Math.floor(Math.random() * 30) + 5;
    totalScore += playerScore;
  }

  return totalScore;
};

// Validate roster requirements
export const validateRoster = (players, sport = 'nfl') => {
  const requirements = {
    nfl: {
      QB: { min: 1, max: 2 },
      RB: { min: 2, max: 4 },
      WR: { min: 3, max: 5 },
      TE: { min: 1, max: 2 },
      K: { min: 1, max: 1 },
      DEF: { min: 1, max: 1 }
    },
    nba: {
      PG: { min: 1, max: 2 },
      SG: { min: 1, max: 2 },
      SF: { min: 1, max: 2 },
      PF: { min: 1, max: 2 },
      C: { min: 1, max: 2 }
    }
  };

  const sportRequirements = requirements[sport] || requirements.nfl;
  const positionCounts = {};
  
  // Count positions
  for (const player of players) {
    positionCounts[player.position] = (positionCounts[player.position] || 0) + 1;
  }

  // Check requirements
  const errors = [];
  
  for (const [position, req] of Object.entries(sportRequirements)) {
    const count = positionCounts[position] || 0;
    
    if (count < req.min) {
      errors.push(`Not enough ${position}s (need at least ${req.min})`);
    }
    if (count > req.max) {
      errors.push(`Too many ${position}s (maximum ${req.max})`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    positionCounts
  };
};

// Format currency
export const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
};

// Calculate payout structure
export const calculatePayouts = (totalPrize, numPlayers) => {
  const payouts = [];
  
  if (numPlayers === 2) {
    // Winner takes all
    payouts.push({ place: 1, amount: totalPrize, percentage: 100 });
  } else if (numPlayers <= 4) {
    // Top 2 get paid
    payouts.push({ place: 1, amount: totalPrize * 0.65, percentage: 65 });
    payouts.push({ place: 2, amount: totalPrize * 0.35, percentage: 35 });
  } else if (numPlayers <= 6) {
    // Top 3 get paid
    payouts.push({ place: 1, amount: totalPrize * 0.50, percentage: 50 });
    payouts.push({ place: 2, amount: totalPrize * 0.30, percentage: 30 });
    payouts.push({ place: 3, amount: totalPrize * 0.20, percentage: 20 });
  } else {
    // Top 4 get paid for 8-10 players
    payouts.push({ place: 1, amount: totalPrize * 0.40, percentage: 40 });
    payouts.push({ place: 2, amount: totalPrize * 0.25, percentage: 25 });
    payouts.push({ place: 3, amount: totalPrize * 0.20, percentage: 20 });
    payouts.push({ place: 4, amount: totalPrize * 0.15, percentage: 15 });
  }
  
  return payouts;
};

// Calculate Kingpin bonus for draft
export const calculateKingpinBonus = (team, newPlayer) => {
  let bonusAdded = 0;
  const roster = team.roster || {};
  const players = Object.values(roster);
  
  // Check for duplicate player bonus
  const duplicates = players.filter(p => 
    p.name === newPlayer.name && p.team === newPlayer.team
  );
  if (duplicates.length === 1) { // Already have one, this makes two
    bonusAdded++;
  }
  
  // Check for QB + pass catcher stack
  const teamQB = players.find(p => 
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
    const hasPassCatcher = players.some(p => 
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