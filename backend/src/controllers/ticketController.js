// backend/src/controllers/ticketController.js
const ticketService = require('../services/ticketService');
const userService = require('../services/userService');

const getTicketBalance = async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const balance = await ticketService.getBalance(userId);
    
    res.json({
      success: true,
      tickets: balance
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

const canClaimWeekly = async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const canClaim = await ticketService.canClaimWeeklyBonus(userId);
    
    res.json({
      success: true,
      canClaim
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

const claimWeeklyBonus = async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    
    // Check if user can claim
    const canClaim = await ticketService.canClaimWeeklyBonus(userId);
    if (!canClaim) {
      return res.status(400).json({
        success: false,
        error: 'Weekly bonus already claimed. Try again later.'
      });
    }
    
    const result = await ticketService.awardWeeklyLogin(userId);
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Weekly bonus claimed!',
        newBalance: result.newBalance
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
        nextAvailable: result.nextAvailable
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

const purchaseTickets = async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { quantity } = req.body;
    
    if (!quantity || quantity < 1) {
      return res.status(400).json({
        success: false,
        error: 'Invalid quantity'
      });
    }
    
    const cost = quantity * 1; // $1 per ticket
    
    // Check user balance
    const user = await userService.getUserById(userId);
    if (user.balance < cost) {
      return res.status(400).json({
        success: false,
        error: 'Insufficient funds',
        required: cost,
        balance: user.balance
      });
    }
    
    // Deduct money
    await userService.updateBalance(
      userId,
      -cost,
      `Purchased ${quantity} tickets`
    );
    
    // Add tickets
    const result = await ticketService.purchaseTickets(userId, quantity);
    
    res.json({
      success: true,
      message: `Purchased ${quantity} tickets for $${cost}`,
      newTicketBalance: result.newBalance,
      newMoneyBalance: user.balance - cost
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

const getTransactionHistory = async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const limit = parseInt(req.query.limit) || 50;
    
    const transactions = await ticketService.getTransactionHistory(userId, limit);
    
    res.json({
      success: true,
      transactions
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

module.exports = {
  getTicketBalance,
  canClaimWeekly,
  claimWeeklyBonus,
  purchaseTickets,
  getTransactionHistory
};