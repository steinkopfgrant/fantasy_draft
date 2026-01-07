// backend/src/services/marketMoverService.js
const Redis = require('ioredis');
const db = require('../models');
const { Op } = require('sequelize');

// Import player pools from gameLogic - this is the single source of truth for the current slate
const { PLAYER_POOLS, WEEK_MATCHUPS } = require('../utils/gameLogic');

// Derive BYE teams from WEEK_MATCHUPS
const BYE_TEAMS = Object.entries(WEEK_MATCHUPS)
  .filter(([team, data]) => data.opp === 'BYE')
  .map(([team]) => team);

class MarketMoverService {
  constructor() {
    // Use REDIS_URL if available (Railway), otherwise fall back to individual vars
    if (process.env.REDIS_URL) {
      this.redis = new Redis(process.env.REDIS_URL, { keyPrefix: 'mm:' });
    } else {
      this.redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        keyPrefix: 'mm:'
      });
    }
    
    // Voting duration - 2 hours per period
    // Voting NEVER stops - just resets immediately after finalization
    this.VOTING_DURATION = 2 * 60 * 60 * 1000; // 2 hours in ms
    
    // Max players in each list
    this.MAX_FIRE_SALE = 3;  // Max 3 HOT players
    this.MAX_COOL_DOWN = 3;  // Max 3 COLD players
    
    // Build the full player list on startup (QB, RB, WR, TE only - no K/DEF)
    // This now uses the imported PLAYER_POOLS which only contains slate-eligible players
    this.allEligiblePlayers = this.buildEligiblePlayersList();
    
    // Initialize voting period on startup
    this.initializeVotingPeriod();
  }

  // Build list of all eligible players for voting from the current slate
  buildEligiblePlayersList() {
    const players = [];
    const positions = ['QB', 'RB', 'WR', 'TE']; // No K or DEF
    const prices = [5, 4, 3, 2, 1];
    
    positions.forEach(position => {
      prices.forEach(price => {
        const pool = PLAYER_POOLS[position]?.[price] || [];
        pool.forEach(player => {
          const id = player.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
          players.push({
            id,
            name: player.name,
            team: player.team,
            position,
            price
          });
        });
      });
    });
    
    console.log(`📋 Built eligible players list: ${players.length} slate-eligible players (QB/RB/WR/TE, $1-$5)`);
    console.log(`📋 BYE teams this week: ${BYE_TEAMS.join(', ')}`);
    return players;
  }

  async initializeVotingPeriod() {
    try {
      const votingData = await this.redis.get('voting:current');
      if (!votingData) {
        console.log('🎲 Initializing first voting period');
        await this.startNewVotingPeriod();
      } else {
        const voting = JSON.parse(votingData);
        const now = Date.now();
        if (voting.endTime && now >= voting.endTime) {
          // Voting period ended - finalize and immediately start new one
          await this.finalizeVoting(voting);
          // Immediately start new voting period (no cooldown!)
          await this.startNewVotingPeriod();
        } else {
          // Schedule next check
          const timeRemaining = voting.endTime - now;
          setTimeout(() => this.checkVotingPeriod(), timeRemaining);
        }
      }
    } catch (error) {
      console.error('Error initializing voting period:', error);
    }
  }

  async startNewVotingPeriod() {
    try {
      // Get existing FIRE SALE and COOL DOWN lists
      const lastResults = await this.redis.get('voting:lastResults');
      let fireSaleList = [];
      let coolDownList = [];
      
      if (lastResults) {
        const parsed = JSON.parse(lastResults);
        fireSaleList = parsed.fireSaleList || [];
        coolDownList = parsed.coolDownList || [];
      }
      
      const now = Date.now();
      const endTime = now + this.VOTING_DURATION;
      
      const votingPeriod = {
        startTime: now,
        endTime: endTime,
        isActive: true,
        votingActive: true,
        votes: {},
        playerData: {},
        fireSaleList: fireSaleList,   // Carry over from last period
        coolDownList: coolDownList     // Carry over from last period
      };
      
      await this.redis.set('voting:current', JSON.stringify(votingPeriod));
      await this.redis.set('voting:endTime', endTime.toString());
      
      // Schedule finalization
      setTimeout(() => this.checkVotingPeriod(), this.VOTING_DURATION);
      
      console.log(`🗳️ New voting period started. Ends at ${new Date(endTime).toLocaleTimeString()}`);
      console.log(`🔥 Current FIRE SALE: ${fireSaleList.map(p => p.name).join(', ') || 'None'}`);
      console.log(`❄️ Current COOL DOWN: ${coolDownList.map(p => p.name).join(', ') || 'None'}`);
      
      return votingPeriod;
    } catch (error) {
      console.error('Error starting new voting period:', error);
      throw error;
    }
  }

  async checkVotingPeriod() {
    try {
      const now = Date.now();
      const votingData = await this.redis.get('voting:current');
      
      if (!votingData) {
        return await this.startNewVotingPeriod();
      }
      
      const voting = JSON.parse(votingData);
      
      if (now >= voting.endTime) {
        console.log('⏰ Voting period ended, calculating results...');
        await this.finalizeVoting(voting);
        // Immediately start new voting period (NO cooldown!)
        await this.startNewVotingPeriod();
      }
    } catch (error) {
      console.error('Error checking voting period:', error);
    }
  }

  async finalizeVoting(votingData) {
    try {
      // Get current lists
      let fireSaleList = votingData.fireSaleList || [];
      let coolDownList = votingData.coolDownList || [];
      
      // Calculate vote results
      const voteResults = [];
      for (const [playerName, voteCount] of Object.entries(votingData.votes || {})) {
        const playerInfo = votingData.playerData?.[playerName] || { name: playerName };
        voteResults.push({
          playerName,
          name: playerInfo.name || playerName,
          position: playerInfo.position,
          team: playerInfo.team,
          price: playerInfo.price,
          votes: voteCount
        });
      }
      
      voteResults.sort((a, b) => b.votes - a.votes);
      
      // Only the WINNER (top voted player) gets added to FIRE SALE
      if (voteResults.length > 0 && voteResults[0].votes > 0) {
        const winner = voteResults[0];
        
        // Check if winner is already in FIRE SALE list
        const alreadyInFireSale = fireSaleList.some(
          p => p.name.toLowerCase() === winner.name.toLowerCase()
        );
        
        // Check if winner is in COOL DOWN (they can't be voted back while cooling)
        const inCoolDown = coolDownList.some(
          p => p.name.toLowerCase() === winner.name.toLowerCase()
        );
        
        if (!alreadyInFireSale && !inCoolDown) {
          console.log(`\n🏆 VOTE WINNER: ${winner.name} with ${winner.votes} votes`);
          
          // If FIRE SALE is full (3 players), oldest gets bumped to COOL DOWN
          if (fireSaleList.length >= this.MAX_FIRE_SALE) {
            const bumpedPlayer = fireSaleList.shift(); // Remove oldest (first in list)
            
            // Add bumped player to COOL DOWN
            coolDownList.push({
              ...bumpedPlayer,
              modifier: 0.1,  // 1/10 probability
              coolDownStarted: Date.now()
            });
            
            console.log(`⬇️ ${bumpedPlayer.name} bumped from FIRE SALE to COOL DOWN`);
            
            // If COOL DOWN would have 4+ players, oldest returns to normal pool
            while (coolDownList.length > this.MAX_COOL_DOWN) {
              const returnedPlayer = coolDownList.shift(); // Remove oldest
              console.log(`🔄 ${returnedPlayer.name} returned to normal player pool`);
            }
          }
          
          // Add winner to FIRE SALE (at end of list - newest)
          fireSaleList.push({
            name: winner.name,
            position: winner.position,
            team: winner.team,
            price: winner.price,
            votes: winner.votes,
            addedAt: Date.now()
          });
          
          console.log(`🔥 ${winner.name} added to FIRE SALE list`);
        } else if (alreadyInFireSale) {
          console.log(`ℹ️ ${winner.name} already in FIRE SALE, no change`);
        } else if (inCoolDown) {
          console.log(`ℹ️ ${winner.name} is cooling down, cannot be voted to FIRE SALE yet`);
        }
      } else {
        console.log('📭 No votes cast this period');
      }
      
      const finalResults = {
        ...votingData,
        isActive: false,
        votingActive: false,
        fireSaleList,
        coolDownList,
        voteResults,
        finalizedAt: Date.now()
      };
      
      await this.redis.set('voting:current', JSON.stringify(finalResults));
      await this.redis.set('voting:lastResults', JSON.stringify(finalResults));
      
      // Save to history
      const historyKey = `voting:history:${Date.now()}`;
      await this.redis.set(historyKey, JSON.stringify(finalResults));
      await this.redis.expire(historyKey, 7 * 24 * 60 * 60); // Keep 7 days
      
      console.log(`\n📊 VOTING PERIOD FINALIZED`);
      console.log(`🔥 FIRE SALE (${fireSaleList.length}/${this.MAX_FIRE_SALE}): ${fireSaleList.map(p => p.name).join(', ') || 'None'}`);
      console.log(`❄️ COOL DOWN (${coolDownList.length}/${this.MAX_COOL_DOWN}): ${coolDownList.map(p => p.name).join(', ') || 'None'}`);
      
      return finalResults;
    } catch (error) {
      console.error('Error finalizing voting:', error);
      throw error;
    }
  }

  async getVotingStatus() {
    try {
      let votingData = await this.redis.get('voting:current');
      
      if (!votingData) {
        const newPeriod = await this.startNewVotingPeriod();
        return this.formatVotingStatus(newPeriod);
      }
      
      const voting = JSON.parse(votingData);
      const now = Date.now();
      
      // Check if voting period has ended
      if (voting.endTime && now >= voting.endTime) {
        await this.finalizeVoting(voting);
        await this.startNewVotingPeriod();
        votingData = await this.redis.get('voting:current');
        const updatedVoting = JSON.parse(votingData);
        return this.formatVotingStatus(updatedVoting);
      }
      
      return this.formatVotingStatus(voting);
    } catch (error) {
      console.error('Error getting voting status:', error);
      return {
        isActive: false,
        votingActive: false,
        fireSaleList: [],
        coolDownList: [],
        availablePlayers: [],
        leaderboard: [],
        error: error.message
      };
    }
  }

  formatVotingStatus(voting) {
    const now = Date.now();
    const timeRemaining = voting.isActive && voting.endTime ? Math.max(0, voting.endTime - now) : 0;
    
    // Filter out players on FIRE SALE and COOL DOWN from available voters
    const unavailableNames = [
      ...(voting.fireSaleList || []).map(p => p.name.toLowerCase()),
      ...(voting.coolDownList || []).map(p => p.name.toLowerCase())
    ];
    
    const availablePlayers = this.allEligiblePlayers.filter(
      p => !unavailableNames.includes(p.name.toLowerCase())
    );
    
    return {
      isActive: voting.isActive && timeRemaining > 0,
      votingActive: voting.isActive && timeRemaining > 0,
      startTime: voting.startTime,
      endTime: voting.endTime,
      nextVoteTime: voting.endTime,
      timeRemaining,
      votes: voting.votes || {},
      fireSaleList: voting.fireSaleList || [],
      coolDownList: voting.coolDownList || [],
      availablePlayers: availablePlayers,
      leaderboard: this.calculateLeaderboard(voting.votes || {}, voting.playerData || {}),
      currentBidUpPlayer: this.getCurrentBidUpFromVoting(voting)
    };
  }

  getCurrentBidUpFromVoting(voting) {
    if (!voting.fireSaleList || voting.fireSaleList.length === 0) {
      return null;
    }
    // Most recent FIRE SALE player (last in list)
    const topPlayer = voting.fireSaleList[voting.fireSaleList.length - 1];
    return {
      name: topPlayer.name,
      boostPercentage: 100, // 100% guaranteed appearance
      endsAt: null // FIRE SALE stays until bumped
    };
  }

  getAvailablePlayers() {
    return this.allEligiblePlayers;
  }

  calculateLeaderboard(votes, playerData) {
    const leaderboard = [];
    
    for (const [playerName, voteCount] of Object.entries(votes)) {
      const data = playerData[playerName] || {};
      leaderboard.push({
        id: playerName.toLowerCase().replace(/[^a-z0-9]/g, '_'),
        name: data.name || playerName,
        position: data.position || '',
        team: data.team || '',
        price: data.price,
        votes: voteCount
      });
    }
    
    return leaderboard.sort((a, b) => b.votes - a.votes).slice(0, 10);
  }

  async getVoteLeaders() {
    const status = await this.getVotingStatus();
    return status.leaderboard || [];
  }

  async getCurrentBidUpPlayer() {
    const status = await this.getVotingStatus();
    return status.currentBidUpPlayer;
  }

  async canUserVote(userId) {
    try {
      const status = await this.getVotingStatus();
      
      if (!status.isActive) {
        return { canVote: false, reason: 'Voting period is closed' };
      }
      
      const user = await db.User.findByPk(userId);
      if (!user) {
        return { canVote: false, reason: 'User not found' };
      }
      
      if (user.tickets < 1) {
        return { canVote: false, reason: 'No tickets available' };
      }
      
      return { canVote: true };
    } catch (error) {
      console.error('Error checking user vote eligibility:', error);
      return { canVote: false, reason: 'Error checking eligibility' };
    }
  }

  async voteForPlayer(userId, playerName, playerId) {
    try {
      const user = await db.User.findByPk(userId);
      if (!user || user.tickets < 1) {
        throw new Error('Insufficient tickets');
      }
      
      const status = await this.getVotingStatus();
      if (!status.isActive) {
        throw new Error('Voting is not currently active');
      }
      
      const normalizedName = playerName.trim();
      
      // Check if player is already on FIRE SALE or COOL DOWN
      const onFireSale = status.fireSaleList.some(
        p => p.name.toLowerCase() === normalizedName.toLowerCase()
      );
      const onCoolDown = status.coolDownList.some(
        p => p.name.toLowerCase() === normalizedName.toLowerCase()
      );
      
      if (onFireSale) {
        throw new Error(`${normalizedName} is already on FIRE SALE`);
      }
      
      if (onCoolDown) {
        throw new Error(`${normalizedName} is on COOL DOWN and cannot be voted for yet`);
      }
      
      // CRITICAL: Validate player is in the current slate
      const playerInfo = this.allEligiblePlayers.find(
        p => p.name.toLowerCase() === normalizedName.toLowerCase()
      );
      
      if (!playerInfo) {
        // Player not in slate - give helpful error message
        throw new Error(`${normalizedName} is not in this week's slate. Only players with games can be voted for.`);
      }
      
      // Deduct ticket
      await user.decrement('tickets', { by: 1 });
      await user.reload();
      
      // Get current voting data
      const votingData = await this.redis.get('voting:current');
      const voting = JSON.parse(votingData);
      
      if (!voting.votes) voting.votes = {};
      if (!voting.playerData) voting.playerData = {};
      
      // Record the vote by player name
      voting.votes[normalizedName] = (voting.votes[normalizedName] || 0) + 1;
      
      // Store player metadata
      voting.playerData[normalizedName] = {
        name: normalizedName,
        position: playerInfo.position,
        team: playerInfo.team,
        price: playerInfo.price
      };
      
      await this.redis.set('voting:current', JSON.stringify(voting));
      
      // Log ticket transaction
      try {
        await db.TicketTransaction.create({
          user_id: userId,
          type: 'use',
          amount: -1,
          balance_after: user.tickets,
          reason: `Voted for ${normalizedName} in Market Mover`
        });
      } catch (txError) {
        console.error('Error creating ticket transaction:', txError);
      }
      
      console.log(`🗳️ User ${userId} voted for ${normalizedName}. Total votes: ${voting.votes[normalizedName]}`);
      
      return {
        success: true,
        message: `Successfully voted for ${normalizedName}`,
        newTicketBalance: user.tickets,
        totalVotes: voting.votes[normalizedName]
      };
      
    } catch (error) {
      console.error('Error voting for player:', error);
      throw error;
    }
  }

  // FIXED: Calculate ownership from lineups table with correct roster structure
  async calculateOwnership(contestId, playerName) {
    try {
      // Query the lineups table for this contest
      const lineups = await db.Lineup.findAll({
        where: { contest_id: contestId },
        attributes: ['roster']
      });
      
      if (lineups.length === 0) {
        console.log(`📊 Ownership check: No lineups found for contest ${contestId}`);
        return 0;
      }
      
      const normalizedSearch = playerName.toLowerCase().trim();
      
      // Count lineups that contain this player in any position
      const withPlayer = lineups.filter(lineup => {
        if (!lineup.roster) return false;
        
        // Check each position slot (QB, RB, WR, TE, FLEX)
        const positions = ['QB', 'RB', 'WR', 'TE', 'FLEX'];
        return positions.some(pos => {
          const player = lineup.roster[pos];
          return player && player.name && 
                 player.name.toLowerCase().trim() === normalizedSearch;
        });
      });
      
      // Calculate percentage with one decimal place
      const ownership = (withPlayer.length / lineups.length) * 100;
      const result = Math.round(ownership * 10) / 10;
      
      console.log(`📊 Ownership: ${playerName} - ${withPlayer.length}/${lineups.length} lineups (${result}%)`);
      
      return result;
    } catch (error) {
      console.error('Error calculating ownership:', error);
      return 0;
    }
  }

  async applyMarketMakerModifiers(playerBoard) {
    try {
      const status = await this.getVotingStatus();
      
      if (!status.fireSaleList.length && !status.coolDownList.length) {
        return playerBoard;
      }
      
      // FIRE SALE: First player is 100% guaranteed, others 50% chance each
      if (status.fireSaleList.length > 0) {
        // First FIRE SALE player is guaranteed
        const guaranteedPlayer = status.fireSaleList[0];
        this.addFireSalePlayer(playerBoard, guaranteedPlayer, true);
        console.log(`🔥 GUARANTEED FIRE SALE: ${guaranteedPlayer.name}`);
        
        // Additional FIRE SALE players have 50% chance each
        for (let i = 1; i < status.fireSaleList.length; i++) {
          if (Math.random() < 0.5) {
            this.addFireSalePlayer(playerBoard, status.fireSaleList[i], false);
            console.log(`🔥 Additional FIRE SALE (50% hit): ${status.fireSaleList[i].name}`);
          }
        }
      }
      
      // COOL DOWN players have 1/10 probability of appearing
      // We don't need to explicitly handle them here since they're
      // already at reduced odds in the normal pool selection
      
      return playerBoard;
    } catch (error) {
      console.error('Error applying modifiers:', error);
      return playerBoard;
    }
  }

  addFireSalePlayer(board, player, isGuaranteed) {
    const priceRowMap = { 5: 0, 4: 1, 3: 2, 2: 3, 1: 4 };
    const positionColMap = { 'QB': 0, 'RB': 1, 'WR': 2, 'TE': 3 };
    
    // Look up correct price from allEligiblePlayers if missing
    let price = player.price;
    if (price === undefined || price === null) {
      const knownPlayer = this.allEligiblePlayers.find(
        p => p.name.toLowerCase() === player.name.toLowerCase()
      );
      price = knownPlayer?.price;
      console.log(`🔍 Looked up price for ${player.name}: $${price}`);
    }
    
    // Look up correct position from allEligiblePlayers if missing
    let position = player.position;
    if (!position) {
      const knownPlayer = this.allEligiblePlayers.find(
        p => p.name.toLowerCase() === player.name.toLowerCase()
      );
      position = knownPlayer?.position;
      console.log(`🔍 Looked up position for ${player.name}: ${position}`);
    }
    
    const targetRow = priceRowMap[parseInt(price, 10)];
    const targetCol = positionColMap[position];
    
    // If we couldn't determine row/col, log error and skip
    if (targetRow === undefined || targetCol === undefined) {
      console.error(`❌ Cannot place Fire Sale player ${player.name}: missing price ($${price}) or position (${position})`);
      return false;
    }
    
    if (board[targetRow] && board[targetRow][targetCol]) {
      board[targetRow][targetCol] = {
        ...board[targetRow][targetCol],
        name: player.name,
        team: player.team,
        isFireSale: true,
        isGuaranteed: isGuaranteed,
        originalPlayer: board[targetRow][targetCol].name
      };
      console.log(`🔥 Placed ${player.name} at row ${targetRow} ($${price}), col ${targetCol} (${position})`);
      return true;
    }
    return false;
  }

  getCoolDownModifier(playerName, coolDownList) {
    const isOnCoolDown = coolDownList.some(
      p => p.name.toLowerCase() === playerName.toLowerCase()
    );
    return isOnCoolDown ? 0.1 : 1.0;
  }

  selectPlayerWithModifiers(eligiblePlayers, coolDownList) {
    if (!eligiblePlayers || eligiblePlayers.length === 0) return null;
    
    let totalWeight = 0;
    const weightedPlayers = eligiblePlayers.map(player => {
      const modifier = this.getCoolDownModifier(player.name, coolDownList);
      const weight = modifier;
      totalWeight += weight;
      return { player, weight };
    });
    
    let random = Math.random() * totalWeight;
    for (const { player, weight } of weightedPlayers) {
      random -= weight;
      if (random <= 0) return player;
    }
    
    return eligiblePlayers[0];
  }

  async resetVoting() {
    try {
      await this.redis.del('voting:current');
      await this.redis.del('voting:endTime');
      await this.redis.del('voting:lastResults');
      
      console.log('🔄 Voting reset complete');
      return await this.startNewVotingPeriod();
    } catch (error) {
      console.error('Error resetting voting:', error);
      throw error;
    }
  }
  
  // Admin function to manually add player to FIRE SALE
  async adminAddToFireSale(playerName) {
    const player = this.allEligiblePlayers.find(
      p => p.name.toLowerCase() === playerName.toLowerCase()
    );
    
    if (!player) {
      throw new Error(`Player not found in current slate. Only slate-eligible players can be added.`);
    }
    
    const votingData = await this.redis.get('voting:current');
    const voting = JSON.parse(votingData);
    
    let fireSaleList = voting.fireSaleList || [];
    let coolDownList = voting.coolDownList || [];
    
    // Bump oldest if full
    if (fireSaleList.length >= this.MAX_FIRE_SALE) {
      const bumped = fireSaleList.shift();
      coolDownList.push({ ...bumped, modifier: 0.1, coolDownStarted: Date.now() });
      while (coolDownList.length > this.MAX_COOL_DOWN) {
        coolDownList.shift();
      }
    }
    
    fireSaleList.push({
      name: player.name,
      position: player.position,
      team: player.team,
      price: player.price,
      votes: 0,
      addedAt: Date.now()
    });
    
    voting.fireSaleList = fireSaleList;
    voting.coolDownList = coolDownList;
    
    await this.redis.set('voting:current', JSON.stringify(voting));
    await this.redis.set('voting:lastResults', JSON.stringify(voting));
    
    return { fireSaleList, coolDownList };
  }
}

module.exports = new MarketMoverService();
