// backend/src/services/userService.js
const bcrypt = require('bcrypt');
const { Op } = require('sequelize');
const db = require('../models');

class UserService {
  async createUser(username, email, password) {
    const transaction = await db.sequelize.transaction();
    
    try {
      // Check if user already exists
      const existingUser = await db.User.findOne({
        where: {
          [Op.or]: [
            { username: username.toLowerCase() },
            { email: email.toLowerCase() }
          ]
        },
        transaction
      });

      if (existingUser) {
        if (existingUser.username.toLowerCase() === username.toLowerCase()) {
          throw new Error('Username already exists');
        }
        if (existingUser.email.toLowerCase() === email.toLowerCase()) {
          throw new Error('Email already exists');
        }
      }

      // Create user (password will be hashed by the model hook)
      const user = await db.User.create({
        username,
        email: email.toLowerCase(),
        password,
        balance: 1000.00,
        tickets: 5
      }, { transaction });

      // Create initial ticket transaction
      await db.TicketTransaction.create({
        user_id: user.id,
        type: 'initial',
        amount: 5,
        balance_after: 5,
        reason: 'Account created'
      }, { transaction });

      // Create initial balance transaction
      await db.Transaction.create({
        user_id: user.id,
        type: 'deposit',
        amount: 1000.00,
        balance_after: 1000.00,
        description: 'Initial account balance'
      }, { transaction });

      await transaction.commit();

      console.log(`Created user: ${username} with ID: ${user.id}`);
      
      // Return user without password and ensure numbers
      const userResponse = user.toJSON();
      delete userResponse.password;
      userResponse.balance = parseFloat(userResponse.balance);
      userResponse.tickets = parseInt(userResponse.tickets);
      return userResponse;
      
    } catch (error) {
      await transaction.rollback();
      console.error('Error creating user:', error);
      throw error;
    }
  }

  async authenticateUser(username, password) {
    try {
      console.log(`Authenticating user: ${username}`);
      
      // Find user by username (case-insensitive)
      const user = await db.User.findOne({
        where: {
          username: {
            [Op.iLike]: username
          }
        }
      });

      if (!user) {
        console.log(`User not found: ${username}`);
        throw new Error('Invalid credentials');
      }

      console.log(`Found user: ${username}, checking password...`);
      
      // Verify password using the model method
      const isValid = await user.validatePassword(password);
      console.log(`Password valid for ${username}: ${isValid}`);
      
      if (!isValid) {
        throw new Error('Invalid credentials');
      }

      // Update last login
      await user.update({ updated_at: new Date() });

      // Return user without password and ensure numbers
      const userResponse = user.toJSON();
      delete userResponse.password;
      userResponse.balance = parseFloat(userResponse.balance);
      userResponse.tickets = parseInt(userResponse.tickets);
      return userResponse;
      
    } catch (error) {
      console.error('Authentication error:', error);
      throw error;
    }
  }

  async getUserById(userId) {
    try {
      const user = await db.User.findByPk(userId, {
        attributes: { exclude: ['password'] }
      });
      
      if (!user) {
        return null;
      }
      
      const userResponse = user.toJSON();
      userResponse.balance = parseFloat(userResponse.balance);
      userResponse.tickets = parseInt(userResponse.tickets);
      return userResponse;
    } catch (error) {
      console.error('Error getting user by ID:', error);
      throw error;
    }
  }

  async updateBalance(userId, amount, reason = 'Update', contestId = null) {
    const transaction = await db.sequelize.transaction();
    
    try {
      // Lock the user row to prevent race conditions
      const user = await db.User.findByPk(userId, {
        lock: transaction.LOCK.UPDATE,
        transaction
      });
      
      if (!user) {
        throw new Error('User not found');
      }

      const currentBalance = parseFloat(user.balance);
      const updateAmount = parseFloat(amount);
      const newBalance = currentBalance + updateAmount;
      
      if (newBalance < 0) {
        throw new Error('Insufficient balance');
      }

      // Update user balance
      await user.update({ balance: newBalance }, { transaction });

      // Determine transaction type
      let transactionType;
      if (updateAmount > 0) {
        if (reason.includes('Prize')) {
          transactionType = 'prize';
        } else if (reason.includes('Refund')) {
          transactionType = 'refund';
        } else {
          transactionType = 'deposit';
        }
      } else {
        transactionType = 'entry_fee';
      }

      // Create transaction record
      await db.Transaction.create({
        user_id: userId,
        type: transactionType,
        amount: Math.abs(updateAmount),
        balance_after: newBalance,
        contest_id: contestId,
        description: reason
      }, { transaction });

      await transaction.commit();
      
      console.log(`Updated balance for user ${userId}: ${updateAmount} (${reason}). New balance: ${newBalance}`);
      return newBalance;
      
    } catch (error) {
      await transaction.rollback();
      console.error('Error updating balance:', error);
      throw error;
    }
  }

  async getBalance(userId) {
    try {
      const user = await db.User.findByPk(userId, {
        attributes: ['balance']
      });
      
      return user ? parseFloat(user.balance) : 0;
    } catch (error) {
      console.error('Error getting balance:', error);
      return 0;
    }
  }

  async getBalanceHistory(userId, limit = 50) {
    try {
      const transactions = await db.Transaction.findAll({
        where: { user_id: userId },
        order: [['created_at', 'DESC']],
        limit,
        include: [{
          model: db.Contest,
          attributes: ['name', 'type'],
          required: false
        }]
      });

      return transactions.map(t => ({
        id: t.id,
        type: t.type,
        amount: parseFloat(t.amount),
        balanceAfter: parseFloat(t.balance_after),
        description: t.description,
        contestName: t.Contest?.name,
        contestType: t.Contest?.type,
        createdAt: t.created_at
      }));
    } catch (error) {
      console.error('Error getting balance history:', error);
      return [];
    }
  }

  async updateTickets(userId, amount, reason = 'Update') {
    const transaction = await db.sequelize.transaction();
    
    try {
      // Lock the user row
      const user = await db.User.findByPk(userId, {
        lock: transaction.LOCK.UPDATE,
        transaction
      });
      
      if (!user) {
        throw new Error('User not found');
      }

      const currentTickets = parseInt(user.tickets);
      const updateAmount = parseInt(amount);
      const newTicketBalance = currentTickets + updateAmount;
      
      if (newTicketBalance < 0) {
        throw new Error('Insufficient tickets');
      }

      // Update user tickets
      await user.update({ tickets: newTicketBalance }, { transaction });

      // Determine transaction type
      let transactionType;
      if (updateAmount > 0) {
        if (reason.includes('Weekly')) {
          transactionType = 'weekly_bonus';
        } else if (reason.includes('draft')) {
          transactionType = 'draft_completion';
        } else if (reason.includes('Purchase')) {
          transactionType = 'purchase';
        } else {
          transactionType = 'initial';
        }
      } else {
        transactionType = 'use';
      }

      // Create ticket transaction record
      await db.TicketTransaction.create({
        user_id: userId,
        type: transactionType,
        amount: updateAmount,
        balance_after: newTicketBalance,
        reason: reason
      }, { transaction });

      await transaction.commit();
      
      console.log(`Updated tickets for user ${userId}: ${updateAmount} (${reason}). New balance: ${newTicketBalance}`);
      return newTicketBalance;
      
    } catch (error) {
      await transaction.rollback();
      console.error('Error updating tickets:', error);
      throw error;
    }
  }

  async canClaimWeeklyBonus(userId) {
    try {
      const user = await db.User.findByPk(userId, {
        attributes: ['last_weekly_claim']
      });
      
      if (!user || !user.last_weekly_claim) {
        return true;
      }
      
      const lastClaim = new Date(user.last_weekly_claim);
      const now = new Date();
      const daysSinceLastClaim = (now - lastClaim) / (1000 * 60 * 60 * 24);
      
      return daysSinceLastClaim >= 7;
    } catch (error) {
      console.error('Error checking weekly bonus:', error);
      return false;
    }
  }

  async claimWeeklyBonus(userId) {
    const transaction = await db.sequelize.transaction();
    
    try {
      const user = await db.User.findByPk(userId, {
        lock: transaction.LOCK.UPDATE,
        transaction
      });
      
      if (!user) {
        throw new Error('User not found');
      }

      // Check if can claim
      if (user.last_weekly_claim) {
        const daysSinceLastClaim = (new Date() - new Date(user.last_weekly_claim)) / (1000 * 60 * 60 * 24);
        if (daysSinceLastClaim < 7) {
          const daysRemaining = Math.ceil(7 - daysSinceLastClaim);
          throw new Error(`Weekly bonus already claimed. Try again in ${daysRemaining} days.`);
        }
      }

      // Update tickets and last claim date
      const currentTickets = parseInt(user.tickets);
      const newTicketBalance = currentTickets + 1;
      
      await user.update({
        tickets: newTicketBalance,
        last_weekly_claim: new Date()
      }, { transaction });

      // Create ticket transaction
      await db.TicketTransaction.create({
        user_id: userId,
        type: 'weekly_bonus',
        amount: 1,
        balance_after: newTicketBalance,
        reason: 'Weekly login bonus'
      }, { transaction });

      await transaction.commit();
      
      return { success: true, newBalance: newTicketBalance };
      
    } catch (error) {
      await transaction.rollback();
      console.error('Error claiming weekly bonus:', error);
      throw error;
    }
  }

  async getAllUsers(options = {}) {
    try {
      const { page = 1, limit = 50, orderBy = 'created_at', order = 'DESC' } = options;
      const offset = (page - 1) * limit;

      const { count, rows } = await db.User.findAndCountAll({
        attributes: { exclude: ['password'] },
        order: [[orderBy, order]],
        limit,
        offset
      });

      return {
        users: rows.map(user => {
          const userData = user.toJSON();
          userData.balance = parseFloat(userData.balance);
          userData.tickets = parseInt(userData.tickets);
          return userData;
        }),
        total: count,
        page,
        totalPages: Math.ceil(count / limit)
      };
    } catch (error) {
      console.error('Error getting all users:', error);
      throw error;
    }
  }

  async getUserStats(userId) {
    try {
      const [
        contestsEntered,
        contestsWon,
        totalWinnings,
        ticketHistory
      ] = await Promise.all([
        db.ContestEntry.count({ where: { user_id: userId } }),
        db.ContestEntry.count({ 
          where: { 
            user_id: userId,
            final_rank: 1 
          } 
        }),
        db.ContestEntry.sum('prize_won', { 
          where: { user_id: userId } 
        }) || 0,
        db.TicketTransaction.findAll({
          where: { user_id: userId },
          order: [['created_at', 'DESC']],
          limit: 10
        })
      ]);

      return {
        contestsEntered,
        contestsWon,
        totalWinnings: parseFloat(totalWinnings),
        winRate: contestsEntered > 0 ? (contestsWon / contestsEntered * 100).toFixed(2) : 0,
        recentTicketActivity: ticketHistory.map(t => ({
          type: t.type,
          amount: t.amount,
          reason: t.reason,
          date: t.created_at
        }))
      };
    } catch (error) {
      console.error('Error getting user stats:', error);
      throw error;
    }
  }

  async deleteUser(userId) {
    const transaction = await db.sequelize.transaction();
    
    try {
      // Soft delete - just mark as inactive
      const user = await db.User.findByPk(userId, { transaction });
      
      if (!user) {
        throw new Error('User not found');
      }

      await user.update({ is_active: false }, { transaction });
      
      await transaction.commit();
      
      console.log(`User ${userId} marked as inactive`);
      return true;
      
    } catch (error) {
      await transaction.rollback();
      console.error('Error deleting user:', error);
      throw error;
    }
  }

  async searchUsers(query, limit = 20) {
    try {
      const users = await db.User.findAll({
        where: {
          [Op.or]: [
            { username: { [Op.iLike]: `%${query}%` } },
            { email: { [Op.iLike]: `%${query}%` } }
          ],
          is_active: true
        },
        attributes: ['id', 'username', 'email', 'created_at'],
        limit,
        order: [['username', 'ASC']]
      });

      return users.map(user => {
        const userData = user.toJSON();
        return userData;
      });
    } catch (error) {
      console.error('Error searching users:', error);
      return [];
    }
  }

  async updateUser(userId, updates) {
    const transaction = await db.sequelize.transaction();
    
    try {
      const user = await db.User.findByPk(userId, { transaction });
      
      if (!user) {
        throw new Error('User not found');
      }

      // Only allow certain fields to be updated
      const allowedUpdates = ['email', 'username'];
      const filteredUpdates = {};
      
      for (const key of allowedUpdates) {
        if (updates[key] !== undefined) {
          filteredUpdates[key] = updates[key];
        }
      }

      await user.update(filteredUpdates, { transaction });
      await transaction.commit();

      const userResponse = user.toJSON();
      delete userResponse.password;
      userResponse.balance = parseFloat(userResponse.balance);
      userResponse.tickets = parseInt(userResponse.tickets);
      return userResponse;
      
    } catch (error) {
      await transaction.rollback();
      console.error('Error updating user:', error);
      throw error;
    }
  }
}

module.exports = new UserService();