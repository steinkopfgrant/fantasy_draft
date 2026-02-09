// backend/src/routes/pools.js
const express = require('express');
const router = express.Router();
const { 
  PLAYER_POOLS, 
  NBA_PLAYER_POOLS,
  WEEK_MATCHUPS, 
  NBA_MATCHUPS,
  getMatchupString,
  getNBAMatchupString 
} = require('../utils/gameLogic');

// GET /api/pools - Get all player pools with pricing
router.get('/', (req, res) => {
  try {
    const sport = req.query.sport || 'NFL';
    
    // Sport-specific configuration
    const isNBA = sport === 'NBA';
    const playerPools = isNBA ? NBA_PLAYER_POOLS : PLAYER_POOLS;
    const positions = isNBA 
      ? ['PG', 'SG', 'SF', 'PF', 'C'] 
      : ['QB', 'RB', 'WR', 'TE'];
    const getMatchup = isNBA ? getNBAMatchupString : getMatchupString;
    
    // Check if pools exist for this sport
    if (!playerPools) {
      return res.json({
        success: true,
        pools: { 5: [], 4: [], 3: [], 2: [], 1: [] },
        positions,
        prices: [5, 4, 3, 2, 1],
        sport,
        message: `No ${sport} player pools available yet`
      });
    }
    
    // Transform pools into frontend-friendly format
    const pools = {};
    const prices = [5, 4, 3, 2, 1];
    
    prices.forEach(price => {
      pools[price] = [];
      
      positions.forEach(position => {
        const positionPool = playerPools[position];
        if (!positionPool) return;
        
        const players = positionPool[price] || [];
        players.forEach(player => {
          pools[price].push({
            name: player.name,
            team: player.team,
            position: position,
            price: price,
            matchup: getMatchup ? getMatchup(player.team) : player.team
          });
        });
      });
      
      // Sort by position order
      const posOrder = isNBA
        ? { PG: 0, SG: 1, SF: 2, PF: 3, C: 4 }
        : { QB: 0, RB: 1, WR: 2, TE: 3 };
      pools[price].sort((a, b) => posOrder[a.position] - posOrder[b.position]);
    });
    
    res.json({
      success: true,
      pools,
      positions,
      prices: [5, 4, 3, 2, 1],
      sport
    });
  } catch (error) {
    console.error('Error fetching pools:', error);
    res.status(500).json({ error: 'Failed to fetch player pools' });
  }
});

module.exports = router;