// backend/src/services/ticketService.js
const db = require('../models');
const { User, TicketTransaction } = db;

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

      // Record the transaction
      await TicketTransaction.create({
        user_id: userId,
        type: this.getTransactionType(description),
        amount: -amount,
        balance_after: newBalance,
        reason: description,
        reference_id: referenceId
      }, { transaction });

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

      // Record the transaction
      await TicketTransaction.create({
        user_id: userId,
        type: this.getTransactionType(description),
        amount: amount,
        balance_after: newBalance,
        reason: description,
        reference_id: referenceId
      }, { transaction });

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

  // Determine transaction type based on description
  getTransactionType(description) {
    const desc = description.toLowerCase();
    
    if (desc.includes('vote') || desc.includes('voting')) {
      return 'used_vote';
    }
    if (desc.includes('ownership')) {
      return 'used_ownership_check';
    }
    if (desc.includes('weekly')) {
      return 'earned_weekly';
    }
    if (desc.includes('draft')) {
      return 'earned_draft_completion';
    }
    if (desc.includes('achievement')) {
      return 'earned_achievement';
    }
    if (desc.includes('purchase')) {
      return 'purchase';
    }
    if (desc.includes('admin')) {
      return 'admin_adjustment';
    }
    
    return 'admin_adjustment'; // Default
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

      const bonusAmount = 5; // 5 tickets per week
      const result = await this.awardTickets(userId, bonusAmount, 'Weekly login bonus');
      
      if (result.success) {
        // Update last weekly bonus time
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
        return true; // First time
      }

      const now = new Date();
      const lastBonus = new Date(user.last_weekly_bonus);
      const daysSinceLastBonus = (now - lastBonus) / (1000 * 60 * 60 * 24);
      
      return daysSinceLastBonus >= 7; // 7 days
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

  // Award tickets for completing a draft
  async awardDraftCompletion(userId, contestId) {
    try {
      // Check if user already got tickets for this contest
      const existingTransaction = await TicketTransaction.findOne({
        where: {
          user_id: userId,
          type: 'earned_draft_completion',
          reference_id: contestId
        }
      });

      if (existingTransaction) {
        console.log(`User ${userId} already received draft completion bonus for contest ${contestId}`);
        return {
          success: false,
          error: 'Draft completion bonus already claimed'
        };
      }

      const bonusAmount = 1; // 1 ticket per draft completion
      return await this.awardTickets(
        userId, 
        bonusAmount, 
        'Draft completion bonus', 
        contestId
      );
    } catch (error) {
      console.error('Error awarding draft completion bonus:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Purchase tickets with real money
  async purchaseTickets(userId, quantity, totalCost) {
    try {
      const userService = require('./userService');
      
      // Check user's balance
      const user = await userService.getUserById(userId);
      if (user.balance < totalCost) {
        throw new Error('Insufficient funds');
      }

      // Deduct money from user's account
      await userService.updateBalance(userId, -totalCost, `Purchased ${quantity} tickets`);

      // Award tickets
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
      const transactions = await TicketTransaction.findAll({
        where: { user_id: userId },
        order: [['created_at', 'DESC']],
        limit: limit
      });

      return transactions.map(t => ({
        id: t.id,
        type: t.type,
        amount: t.amount,
        balanceAfter: t.balance_after,
        description: t.description,
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
      const transactions = await TicketTransaction.findAll({
        where: { user_id: userId },
        attributes: [
          [db.sequelize.fn('SUM', db.sequelize.literal('CASE WHEN amount > 0 THEN amount ELSE 0 END')), 'total_earned'],
          [db.sequelize.fn('SUM', db.sequelize.literal('CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END')), 'total_spent'],
          [db.sequelize.fn('COUNT', db.sequelize.literal('CASE WHEN type = \'used_vote\' THEN 1 END')), 'votes_cast'],
          [db.sequelize.fn('COUNT', db.sequelize.literal('CASE WHEN type = \'used_ownership_check\' THEN 1 END')), 'ownership_checks']
        ]
      });

      const stats = transactions[0];
      const currentBalance = await this.getBalance(userId);

      return {
        currentBalance: currentBalance,
        totalEarned: parseInt(stats.getDataValue('total_earned')) || 0,
        totalSpent: parseInt(stats.getDataValue('total_spent')) || 0,
        votesCast: parseInt(stats.getDataValue('votes_cast')) || 0,
        ownershipChecks: parseInt(stats.getDataValue('ownership_checks')) || 0
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