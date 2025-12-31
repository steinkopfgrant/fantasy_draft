// backend/src/services/settlement/strategies/MarketMoverSettlement.js
const BaseSettlement = require('./BaseSettlement');

class MarketMoverSettlement extends BaseSettlement {
  getType() {
    return 'market';
  }

  /**
   * Market Mover Tournament rules:
   * - Up to 5000 entries
   * - $25 entry fee
   * - $120,000 prize pool
   * - Tiered payout structure
   * - Ties at same rank split the combined prizes for those positions
   */
  
  getPayoutStructure() {
    // $120,000 total prize pool
    return [
      { rank: 1, payout: 25000 },
      { rank: 2, payout: 15000 },
      { rank: 3, payout: 10000 },
      { rankStart: 4, rankEnd: 5, payout: 5000 },       // 2 spots × $5000 = $10,000
      { rankStart: 6, rankEnd: 10, payout: 1000 },      // 5 spots × $1000 = $5,000
      { rankStart: 11, rankEnd: 20, payout: 800 },      // 10 spots × $800 = $8,000
      { rankStart: 21, rankEnd: 50, payout: 400 },      // 30 spots × $400 = $12,000
      { rankStart: 51, rankEnd: 100, payout: 200 },     // 50 spots × $200 = $10,000
      { rankStart: 101, rankEnd: 200, payout: 100 },    // 100 spots × $100 = $10,000
      { rankStart: 201, rankEnd: 500, payout: 50 },     // 300 spots × $50 = $15,000
      // Total: $120,000 - Top 10% (500 of 5000) cash
    ];
  }

  getPrizeForRank(rank, prizeStructure = null) {
    const structure = prizeStructure || this.getPayoutStructure();
    
    for (const tier of structure) {
      if (tier.rank && rank === tier.rank) {
        return tier.payout;
      }
      if (tier.rankStart && tier.rankEnd && rank >= tier.rankStart && rank <= tier.rankEnd) {
        return tier.payout;
      }
    }
    return 0;
  }

  /**
   * Get the highest paid rank (last rank that gets money)
   */
  getLastPaidRank() {
    const structure = this.getPayoutStructure();
    let lastPaid = 0;
    for (const tier of structure) {
      if (tier.rank) {
        lastPaid = Math.max(lastPaid, tier.rank);
      }
      if (tier.rankEnd) {
        lastPaid = Math.max(lastPaid, tier.rankEnd);
      }
    }
    return lastPaid;
  }

  async settle(contest, transaction) {
    console.log(`\n📈 SETTLING MARKET MOVER TOURNAMENT: ${contest.name} (${contest.id})`);
    
    // Validate
    await this.validateSettlement(contest);
    
    // Get ALL entries sorted by score
    const entries = await this.getEntriesSortedByScore(contest.id, transaction);
    
    console.log(`📊 Found ${entries.length} entries to rank`);
    
    if (entries.length === 0) {
      console.log('⚠️ No entries to settle');
      return { settled: false, reason: 'No entries' };
    }
    
    // Assign ranks with tie handling
    const rankedEntries = this.assignRanks(entries);
    
    // Calculate payouts
    const payouts = this.calculatePayoutsWithTies(rankedEntries);
    
    // Process all results
    const results = [];
    let totalPaid = 0;
    let winnersCount = 0;
    
    console.log(`\n🏆 TOP 20 RESULTS:`);
    
    for (let i = 0; i < rankedEntries.length; i++) {
      const entry = rankedEntries[i];
      const payout = payouts.get(entry.id) || 0;
      
      const result = await this.processWinner(
        entry,
        entry.rank,
        payout,
        contest.id,
        transaction
      );
      
      results.push(result);
      
      if (payout > 0) {
        totalPaid += payout;
        winnersCount++;
      }
      
      // Log top 20
      if (i < 20) {
        console.log(`  ${entry.rank}. ${entry.User?.username || 'Unknown'}: ${entry.totalPoints.toFixed(2)} pts → $${payout.toFixed(2)}`);
      }
    }
    
    console.log(`  ... and ${rankedEntries.length - 20} more entries`);
    console.log(`\n✅ Market Mover settled:`);
    console.log(`   Total entries: ${entries.length}`);
    console.log(`   Winners paid: ${winnersCount}`);
    console.log(`   Total paid: $${totalPaid.toFixed(2)}`);
    console.log(``);
    
    return {
      settled: true,
      contestId: contest.id,
      contestType: 'market',
      totalEntries: entries.length,
      winnersPaid: winnersCount,
      totalPaid,
      topResults: results.slice(0, 50)
    };
  }

  /**
   * Calculate payouts with proper tie handling
   * When players tie, they split the combined prizes for those positions
   */
  calculatePayoutsWithTies(rankedEntries) {
    const payouts = new Map();
    const prizeStructure = this.getPayoutStructure();
    const lastPaidRank = this.getLastPaidRank();
    
    // Group entries by their score to find ties
    const scoreGroups = new Map();
    
    for (const entry of rankedEntries) {
      const score = entry.totalPoints;
      if (!scoreGroups.has(score)) {
        scoreGroups.set(score, []);
      }
      scoreGroups.get(score).push(entry);
    }
    
    // Process each score group
    for (const [score, tiedEntries] of scoreGroups) {
      if (tiedEntries.length === 1) {
        // No tie - simple payout
        const entry = tiedEntries[0];
        const payout = this.getPrizeForRank(entry.rank, prizeStructure);
        payouts.set(entry.id, payout);
      } else {
        // Tie - calculate combined prize and split
        const startRank = tiedEntries[0].rank;
        const endRank = startRank + tiedEntries.length - 1;
        
        // Sum prizes for all positions that would be occupied
        let totalPrize = 0;
        for (let rank = startRank; rank <= Math.min(endRank, lastPaidRank); rank++) {
          totalPrize += this.getPrizeForRank(rank, prizeStructure);
        }
        
        // Split evenly
        const prizePerPerson = totalPrize / tiedEntries.length;
        
        for (const entry of tiedEntries) {
          payouts.set(entry.id, prizePerPerson);
        }
        
        if (totalPrize > 0) {
          console.log(`   🔗 ${tiedEntries.length}-way tie at rank ${startRank}: $${totalPrize.toFixed(2)} split = $${prizePerPerson.toFixed(2)} each`);
        }
      }
    }
    
    return payouts;
  }

  /**
   * Preview settlement without committing
   */
  async previewSettlement(contestId) {
    const { Contest } = this.models;
    const contest = await Contest.findByPk(contestId);
    
    if (!contest) {
      throw new Error('Contest not found');
    }
    
    // Get entries sorted by score (no transaction)
    const entries = await this.getEntriesSortedByScore(contestId, null);
    const rankedEntries = this.assignRanks(entries);
    const payouts = this.calculatePayoutsWithTies(rankedEntries);
    
    let totalPaid = 0;
    const preview = rankedEntries.map(entry => {
      const payout = payouts.get(entry.id) || 0;
      totalPaid += payout;
      return {
        rank: entry.rank,
        username: entry.User?.username,
        totalPoints: entry.totalPoints,
        payout
      };
    });
    
    return {
      contestId,
      contestName: contest.name,
      totalEntries: entries.length,
      totalPayout: totalPaid,
      expectedPool: 120000,
      difference: 120000 - totalPaid,
      preview: preview.slice(0, 100) // Top 100 for preview
    };
  }
}

module.exports = MarketMoverSettlement;