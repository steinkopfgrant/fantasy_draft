// backend/src/services/ticketService.js
// FIXED: Uses raw SQL queries to avoid enum_ticket_transactions_type issues
const db = require('../models');
const { User } = db;

class TicketService {
  
  // Get user's current ticket balance
  async getBalance(userId) {
    try {
      const user = await User.findByPk(userId);
      return user ? parseInt(user.tickets) || 0 : 0;
    } catch (error) {
      console.error('Error getting ticket balance:', error);
      return 0;
    }
  }

  // Award tickets for completing a draft - COMPLETELY REWRITTEN
  async awardDraftCompletion(userId, entryId) {
    try {
      console.log(`🎟️ awardDraftCompletion called for user ${userId}, entry ${entryId}`);
      
      // Check if already awarded using raw SQL to avoid enum issues
      // Search by reason text instead of type
      const [existingRows] = await db.sequelize.query(
        `SELECT id FROM ticket_transactions 
         WHERE user_id = :userId 
         AND reference_id = :entryId
         LIMIT 1`,
        {
          replacements: { userId, entryId },
          type: db.sequelize.QueryTypes.SELECT
        }
      );

      if (existingRows) {
        console.log(`⚠️ User ${userId} already received ticket for entry ${entryId}`);
        return {
          success: false,
          error: 'Draft completion bonus already claimed'
        };
      }

      // Get user and update balance
      const user = await User.findByPk(userId);
      if (!user) {
        console.error(`❌ User ${userId} not found`);
        return { success: false, error: 'User not found' };
      }

      const currentBalance = parseInt(user.tickets) || 0;
      const bonusAmount = 1;
      const newBalance = currentBalance + bonusAmount;

      // Update user's ticket balance
      await user.update({ tickets: newBalance });

      // Record transaction using raw SQL with 'purchase' type (which exists in enum)
      await db.sequelize.query(
        `INSERT INTO ticket_transactions (id, user_id, type, amount, balance_after, reference_id, reason, created_at)
         VALUES (gen_random_uuid(), :userId, 'purchase', :amount, :balanceAfter, :referenceId, :reason, NOW())`,
        {
          replacements: {
            userId,
            amount: bonusAmount,
            balanceAfter: newBalance,
            referenceId: entryId,
            reason: 'Draft completion bonus'
          }
        }
      );

      console.log(`✅ User ${userId} earned ${bonusAmount} ticket. New balance: ${newBalance}`);

      return {
        success: true,
        newBalance: newBalance,
        earned: bonusAmount
      };
    } catch (error) {
      console.error('❌ Error awarding draft completion bonus:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Use tickets for various purposes
  async useTickets(userId, amount, description, referenceId = null) {
    const transaction = await db.sequelize.transaction();
    
    try {
      if (!userId || amount <= 0) {
        throw new Error('Invalid parameters');
      }

      const user = await User.findByPk(userId, { transaction });
      if (!user) {
        throw new Error('User not found');
      }

      const currentBalance = parseInt(user.tickets) || 0;
      if (currentBalance < amount) {
        throw new Error(`Insufficient tickets. Need ${amount}, have ${currentBalance}`);
      }

      const newBalance = currentBalance - amount;
      
      // Update user's ticket balance
      await user.update({ tickets: newBalance }, { transaction });

      // Record the transaction using raw SQL
      const transactionType = this.getSafeTransactionType(description);
      await db.sequelize.query(
        `INSERT INTO ticket_transactions (id, user_id, type, amount, balance_after, reference_id, reason, created_at)
         VALUES (gen_random_uuid(), :userId, :type, :amount, :balanceAfter, :referenceId, :reason, NOW())`,
        {
          replacements: {
            userId,
            type: transactionType,
            amount: -amount,
            balanceAfter: newBalance,
            referenceId: referenceId,
            reason: description
          },
          transaction
        }
      );

      await transaction.commit();

      console.log(`User ${userId} used ${amount} tickets: ${description}. New balance: ${newBalance}`);
      
      return {
        success: true,
        newBalance: newBalance,
        used: amount
      };
    } catch (error) {
      await transaction.rollback();
      console.error('Error using tickets:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Award tickets for various activities
  async awardTickets(userId, amount, description, referenceId = null) {
    const transaction = await db.sequelize.transaction();
    
    try {
      if (!userId || amount <= 0) {
        throw new Error('Invalid parameters');
      }

      const user = await User.findByPk(userId, { transaction });
      if (!user) {
        throw new Error('User not found');
      }

      const currentBalance = parseInt(user.tickets) || 0;
      const newBalance = currentBalance + amount;
      
      // Update user's ticket balance
      await user.update({ tickets: newBalance }, { transaction });

      // Record the transaction using raw SQL
      const transactionType = this.getSafeTransactionType(description);
      await db.sequelize.query(
        `INSERT INTO ticket_transactions (id, user_id, type, amount, balance_after, reference_id, reason, created_at)
         VALUES (gen_random_uuid(), :userId, :type, :amount, :balanceAfter, :referenceId, :reason, NOW())`,
        {
          replacements: {
            userId,
            type: transactionType,
            amount: amount,
            balanceAfter: newBalance,
            referenceId: referenceId,
            reason: description
          },
          transaction
        }
      );

      await transaction.commit();

      console.log(`User ${userId} earned ${amount} tickets: ${description}. New balance: ${newBalance}`);
      
      return {
        success: true,
        newBalance: newBalance,
        earned: amount
      };
    } catch (error) {
      await transaction.rollback();
      console.error('Error awarding tickets:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get a safe transaction type that exists in the enum
  // Falls back to 'purchase' which should always exist
  getSafeTransactionType(description) {
    if (!description) return 'purchase';
    const desc = description.toLowerCase();
    
    // Map descriptions to known enum values
    if (desc.includes('vote') || desc.includes('voting')) {
      return 'used_vote';
    }
    if (desc.includes('ownership')) {
      return 'used_ownership_check';
    }
    if (desc.includes('weekly')) {
      return 'earned_weekly';
    }
    if (desc.includes('achievement')) {
      return 'earned_achievement';
    }
    if (desc.includes('admin')) {
      return 'admin_adjustment';
    }
    
    // Default to 'purchase' which should always exist
    return 'purchase';
  }

  // Award weekly login bonus
  async awardWeeklyLogin(userId) {
    try {
      const user = await User.findByPk(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const canClaim = await this.canClaimWeeklyBonus(userId);
      if (!canClaim) {
        return {
          success: false,
          error: 'Weekly bonus already claimed',
          nextAvailable: this.getNextWeeklyBonusTime(user.last_weekly_bonus)
        };
      }

      const bonusAmount = 5;
      const result = await this.awardTickets(userId, bonusAmount, 'Weekly login bonus');
      
      if (result.success) {
        await user.update({ last_weekly_bonus: new Date() });
      }

      return result;
    } catch (error) {
      console.error('Error awarding weekly login bonus:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Check if user can claim weekly bonus
  async canClaimWeeklyBonus(userId) {
    try {
      const user = await User.findByPk(userId);
      if (!user) return false;

      if (!user.last_weekly_bonus) {
        return true;
      }

      const now = new Date();
      const lastBonus = new Date(user.last_weekly_bonus);
      const daysSinceLastBonus = (now - lastBonus) / (1000 * 60 * 60 * 24);
      
      return daysSinceLastBonus >= 7;
    } catch (error) {
      console.error('Error checking weekly bonus eligibility:', error);
      return false;
    }
  }

  // Get next weekly bonus time
  getNextWeeklyBonusTime(lastBonusDate) {
    if (!lastBonusDate) return new Date();
    
    const nextBonus = new Date(lastBonusDate);
    nextBonus.setDate(nextBonus.getDate() + 7);
    return nextBonus;
  }

  // Purchase tickets with real money
  async purchaseTickets(userId, quantity, totalCost) {
    try {
      const userService = require('./userService');
      
      const user = await userService.getUserById(userId);
      if (user.balance < totalCost) {
        throw new Error('Insufficient funds');
      }

      await userService.updateBalance(userId, -totalCost, `Purchased ${quantity} tickets`);

      const result = await this.awardTickets(
        userId, 
        quantity, 
        `Purchased ${quantity} tickets for $${totalCost}`
      );

      return {
        success: true,
        ticketsAwarded: quantity,
        costPaid: totalCost,
        newTicketBalance: result.newBalance
      };
    } catch (error) {
      console.error('Error purchasing tickets:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get transaction history for a user
  async getTransactionHistory(userId, limit = 50) {
    try {
      const transactions = await db.sequelize.query(
        `SELECT id, type, amount, balance_after, reference_id, reason, created_at
         FROM ticket_transactions
         WHERE user_id = :userId
         ORDER BY created_at DESC
         LIMIT :limit`,
        {
          replacements: { userId, limit },
          type: db.sequelize.QueryTypes.SELECT
        }
      );

      return transactions.map(t => ({
        id: t.id,
        type: t.type,
        amount: t.amount,
        balanceAfter: t.balance_after,
        description: t.reason,
        date: t.created_at,
        referenceId: t.reference_id
      }));
    } catch (error) {
      console.error('Error getting transaction history:', error);
      return [];
    }
  }

  // Admin function to adjust tickets
  async adminAdjustTickets(userId, amount, reason, adminId) {
    try {
      const description = `Admin adjustment by ${adminId}: ${reason}`;
      
      if (amount > 0) {
        return await this.awardTickets(userId, amount, description);
      } else {
        return await this.useTickets(userId, Math.abs(amount), description);
      }
    } catch (error) {
      console.error('Error in admin ticket adjustment:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get user's total earned and spent tickets
  async getUserTicketStats(userId) {
    try {
      const stats = await db.sequelize.query(
        `SELECT 
           COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) as total_earned,
           COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) as total_spent,
           COUNT(CASE WHEN type = 'used_vote' THEN 1 END) as votes_cast,
           COUNT(CASE WHEN type = 'used_ownership_check' THEN 1 END) as ownership_checks
         FROM ticket_transactions
         WHERE user_id = :userId`,
        {
          replacements: { userId },
          type: db.sequelize.QueryTypes.SELECT
        }
      );

      const currentBalance = await this.getBalance(userId);
      const result = stats[0] || {};

      return {
        currentBalance: currentBalance,
        totalEarned: parseInt(result.total_earned) || 0,
        totalSpent: parseInt(result.total_spent) || 0,
        votesCast: parseInt(result.votes_cast) || 0,
        ownershipChecks: parseInt(result.ownership_checks) || 0
      };
    } catch (error) {
      console.error('Error getting user ticket stats:', error);
      return {
        currentBalance: 0,
        totalEarned: 0,
        totalSpent: 0,
        votesCast: 0,
        ownershipChecks: 0
      };
    }
  }
}

module.exports = new TicketService();