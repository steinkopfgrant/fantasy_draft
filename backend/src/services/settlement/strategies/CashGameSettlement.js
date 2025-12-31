// backend/src/services/settlement/strategies/CashGameSettlement.js
const BaseSettlement = require('./BaseSettlement');

class CashGameSettlement extends BaseSettlement {
  getType() {
    return 'cash';
  }

  /**
   * Cash game rules:
   * - 5 players per draft room
   * - $5 entry fee = $25 total
   * - $24 to winner (rake = $1)
   * - Ties split the prize
   */
  async settle(contest, transaction) {
    console.log(`\n💵 SETTLING CASH GAME: ${contest.name} (${contest.id})`);
    
    // Validate
    await this.validateSettlement(contest);
    
    // Get entries sorted by score
    const entries = await this.getEntriesSortedByScore(contest.id, transaction);
    
    console.log(`📊 Found ${entries.length} entries`);
    
    if (entries.length === 0) {
      console.log('⚠️ No entries to settle');
      return { settled: false, reason: 'No entries' };
    }
    
    if (entries.length !== 5) {
      console.log(`⚠️ Expected 5 entries, found ${entries.length}`);
      // Still proceed but log warning
    }
    
    // Assign ranks
    const rankedEntries = this.assignRanks(entries);
    
    // Find winner(s) - could be ties
    const topScore = rankedEntries[0].totalPoints;
    const winners = rankedEntries.filter(e => e.totalPoints === topScore);
    
    console.log(`🏆 Top score: ${topScore.toFixed(2)} pts - ${winners.length} winner(s)`);
    
    // Calculate prize
    const prizePool = parseFloat(contest.prize_pool || contest.prizePool || 24);
    const prizePerWinner = prizePool / winners.length;
    
    console.log(`💰 Prize pool: $${prizePool} | Per winner: $${prizePerWinner.toFixed(2)}`);
    
    // Process results
    const results = [];
    
    for (const entry of rankedEntries) {
      const isWinner = entry.totalPoints === topScore;
      const payout = isWinner ? prizePerWinner : 0;
      
      const result = await this.processWinner(
        entry,
        entry.rank,
        payout,
        contest.id,
        transaction
      );
      
      results.push(result);
      
      console.log(`  ${entry.rank}. ${entry.User?.username || 'Unknown'}: ${entry.totalPoints.toFixed(2)} pts → $${payout.toFixed(2)}`);
    }
    
    console.log(`✅ Cash game settled: ${winners.length} winner(s) paid\n`);
    
    return {
      settled: true,
      contestId: contest.id,
      contestType: 'cash',
      totalEntries: entries.length,
      prizePool,
      winners: results.filter(r => r.payout > 0),
      results
    };
  }

  /**
   * Settle all draft rooms for a cash game contest
   * Cash games can have multiple draft rooms per contest
   */
  async settleAllRooms(contest, transaction) {
    const { ContestEntry } = this.models;
    
    // Get unique draft room IDs
    const rooms = await ContestEntry.findAll({
      where: { contest_id: contest.id },
      attributes: ['draft_room_id'],
      group: ['draft_room_id']
    });
    
    console.log(`\n💵 SETTLING ${rooms.length} CASH GAME ROOMS for ${contest.name}`);
    
    const allResults = [];
    
    for (const room of rooms) {
      const roomId = room.draft_room_id;
      console.log(`\n--- Room: ${roomId} ---`);
      
      // Get entries for this room only
      const entries = await ContestEntry.findAll({
        where: {
          contest_id: contest.id,
          draft_room_id: roomId,
          status: 'completed'
        },
        order: [['total_points', 'DESC']],
        include: [{
          model: this.models.User,
          attributes: ['id', 'username']
        }],
        transaction
      });
      
      if (entries.length !== 5) {
        console.log(`⚠️ Room ${roomId} has ${entries.length} entries, expected 5 - skipping`);
        continue;
      }
      
      // Assign ranks within this room
      const rankedEntries = this.assignRanks(entries);
      
      // Find winner(s)
      const topScore = rankedEntries[0].totalPoints;
      const winners = rankedEntries.filter(e => e.totalPoints === topScore);
      
      // Prize per room
      const prizePool = 24; // $24 per 5-person room
      const prizePerWinner = prizePool / winners.length;
      
      // Process results
      for (const entry of rankedEntries) {
        const isWinner = entry.totalPoints === topScore;
        const payout = isWinner ? prizePerWinner : 0;
        
        const result = await this.processWinner(
          entry,
          entry.rank,
          payout,
          contest.id,
          transaction
        );
        
        allResults.push({
          ...result,
          roomId
        });
        
        console.log(`  ${entry.rank}. ${entry.User?.username}: ${entry.totalPoints.toFixed(2)} pts → $${payout.toFixed(2)}`);
      }
    }
    
    console.log(`\n✅ Settled ${rooms.length} rooms, ${allResults.filter(r => r.payout > 0).length} total winners\n`);
    
    return {
      settled: true,
      contestId: contest.id,
      roomsSettled: rooms.length,
      totalWinners: allResults.filter(r => r.payout > 0).length,
      results: allResults
    };
  }
}

module.exports = CashGameSettlement;