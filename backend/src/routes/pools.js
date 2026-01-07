// backend/src/routes/pools.js
const express = require('express');
const router = express.Router();
const { PLAYER_POOLS, WEEK_MATCHUPS, getMatchupString } = require('../utils/gameLogic');

// GET /api/pools - Get all player pools with pricing
router.get('/', (req, res) => {
  try {
    // Transform PLAYER_POOLS into frontend-friendly format
    const pools = {};
    const prices = [5, 4, 3, 2, 1];
    const positions = ['QB', 'RB', 'WR', 'TE'];
    
    prices.forEach(price => {
      pools[price] = [];
      
      positions.forEach(position => {
        const players = PLAYER_POOLS[position][price] || [];
        players.forEach(player => {
          pools[price].push({
            name: player.name,
            team: player.team,
            position: position,
            price: price,
            matchup: getMatchupString(player.team)
          });
        });
      });
      
      // Sort by position order: QB, RB, WR, TE
      const posOrder = { QB: 0, RB: 1, WR: 2, TE: 3 };
      pools[price].sort((a, b) => posOrder[a.position] - posOrder[b.position]);
    });
    
    res.json({
      success: true,
      pools,
      positions: ['QB', 'RB', 'WR', 'TE'],
      prices: [5, 4, 3, 2, 1]
    });
  } catch (error) {
    console.error('Error fetching pools:', error);
    res.status(500).json({ error: 'Failed to fetch player pools' });
  }
});

module.exports = router;

// Don't forget to add to your main server file:
// const poolsRoutes = require('./routes/pools');
// app.use('/api/pools', poolsRoutes);