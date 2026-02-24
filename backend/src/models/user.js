// backend/src/models/user.js
const { DataTypes } = require('sequelize');
const bcrypt = require('bcrypt');

module.exports = (sequelize) => {
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    username: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      validate: {
        len: [3, 50],
        isAlphanumeric: {
          msg: 'Username can only contain letters and numbers'
        }
      }
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true
      }
    },
    password: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        len: [6, 255]
      }
    },
    date_of_birth: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      comment: 'User date of birth for age verification (must be 18+)'
    },
    tos_accepted_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Timestamp when user accepted Terms of Service'
    },
    balance: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 1000.00,
      validate: {
        min: 0
      }
    },
    tickets: {
      type: DataTypes.INTEGER,
      defaultValue: 5,
      validate: {
        min: 0
      }
    },
    
    // Cosmetics - Equipped stamp frame
    equipped_stamp: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: null,
      comment: 'Currently equipped stamp frame: beta_tester, cash_king, or null'
    },
    
    // Market Mover specific fields
    market_mover_votes_cast: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Total number of Market Mover votes cast'
    },
    market_mover_wins: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Number of times user\'s voted player won BID UP'
    },
    ownership_checks_made: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Total number of ownership checks performed'
    },
    last_daily_ticket_claim: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Last time user claimed daily tickets'
    },
    
    role: {
      type: DataTypes.ENUM('user', 'admin', 'moderator'),
      defaultValue: 'user'
    },
    is_admin: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    last_login: {
      type: DataTypes.DATE,
      allowNull: true
    },
    last_weekly_claim: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Last time user claimed weekly ticket bonus'
    },
    
    // Push notification fields
    push_subscription: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Web push notification subscription object'
    },
    push_enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Whether user has push notifications enabled'
    },
    
    // Achievement fields
    achievement_points: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Total points earned from achievements'
    },
    selected_badge: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Currently selected achievement badge to display'
    },
    selected_title: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Currently selected achievement title'
    },
    selected_avatar: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Currently selected avatar image URL'
    },
    unlocked_emotes: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: [],
      comment: 'Array of unlocked emote IDs'
    },
    unlocked_avatars: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: [],
      comment: 'Array of unlocked avatar IDs'
    },
    unlocked_badges: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: [],
      comment: 'Array of unlocked badge IDs'
    },
    
    // Profile customization
    profile_color: {
      type: DataTypes.STRING(7),
      defaultValue: '#00d4ff',
      validate: {
        is: /^#[0-9A-F]{6}$/i
      }
    },
    bio: {
      type: DataTypes.TEXT,
      allowNull: true,
      validate: {
        len: [0, 500]
      }
    },
    
    // Statistics tracking
    total_contests_entered: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    total_contests_won: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    total_prize_money: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0
    },
    highest_score: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0
    },
    win_rate: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 0,
      comment: 'Win percentage'
    },
    
    // Preferences
    email_notifications: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    draft_reminders: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    contest_updates: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    sound_enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    auto_pick_enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    
    // Security
    two_factor_enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    two_factor_secret: {
      type: DataTypes.STRING,
      allowNull: true
    },
    password_reset_token: {
      type: DataTypes.STRING,
      allowNull: true
    },
    password_reset_expires: {
      type: DataTypes.DATE,
      allowNull: true
    },
    email_verification_token: {
      type: DataTypes.STRING,
      allowNull: true
    },
    email_verified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    
    // Timestamps
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'users',
    timestamps: true,
    underscored: true,
    hooks: {
      beforeCreate: async (user) => {
        if (user.password) {
          const salt = await bcrypt.genSalt(10);
          user.password = await bcrypt.hash(user.password, salt);
        }
        if (user.email) {
          user.email = user.email.toLowerCase();
        }
        if (user.username) {
          user.username = user.username.toLowerCase();
        }
      },
      beforeUpdate: async (user) => {
        if (user.changed('password')) {
          const salt = await bcrypt.genSalt(10);
          user.password = await bcrypt.hash(user.password, salt);
        }
        if (user.changed('email')) {
          user.email = user.email.toLowerCase();
        }
      }
    }
  });

  // Instance methods
  User.prototype.validatePassword = async function(password) {
    return bcrypt.compare(password, this.password);
  };

  User.prototype.toJSON = function() {
    const values = Object.assign({}, this.get());
    delete values.password;
    delete values.two_factor_secret;
    delete values.password_reset_token;
    delete values.email_verification_token;
    
    // Add computed Market Mover stats
    values.marketMoverStats = {
      votes_cast: values.market_mover_votes_cast || 0,
      bid_up_wins: values.market_mover_wins || 0,
      ownership_checks: values.ownership_checks_made || 0,
      vote_success_rate: values.market_mover_votes_cast > 0 
        ? ((values.market_mover_wins / values.market_mover_votes_cast) * 100).toFixed(1)
        : '0'
    };
    
    return values;
  };

  User.prototype.canClaimWeeklyBonus = function() {
    if (!this.last_weekly_claim) return true;
    const daysSinceLastClaim = (new Date() - new Date(this.last_weekly_claim)) / (1000 * 60 * 60 * 24);
    return daysSinceLastClaim >= 7;
  };

  // Check if user can claim daily tickets
  User.prototype.canClaimDailyTickets = function() {
    if (!this.last_daily_ticket_claim) return true;
    
    const now = new Date();
    const lastClaim = new Date(this.last_daily_ticket_claim);
    
    // Reset at midnight UTC
    const todayMidnight = new Date(now);
    todayMidnight.setUTCHours(0, 0, 0, 0);
    
    const lastClaimMidnight = new Date(lastClaim);
    lastClaimMidnight.setUTCHours(0, 0, 0, 0);
    
    return todayMidnight > lastClaimMidnight;
  };

  // Add tickets with validation
  User.prototype.addTickets = async function(amount, reason) {
    if (amount < 0) {
      throw new Error('Cannot add negative tickets');
    }
    
    this.tickets = (this.tickets || 0) + amount;
    await this.save();
    
    // Log the transaction (assuming you have a Transaction model)
    if (this.sequelize.models.Transaction) {
      await this.sequelize.models.Transaction.create({
        user_id: this.id,
        type: 'ticket_add',
        amount: amount,
        balance_after: this.tickets,
        description: reason || 'Tickets added'
      });
    }
    
    return this.tickets;
  };

  // Use tickets with validation
  User.prototype.useTickets = async function(amount, reason) {
    if (amount < 0) {
      throw new Error('Cannot use negative tickets');
    }
    
    if (this.tickets < amount) {
      throw new Error('Insufficient tickets');
    }
    
    this.tickets -= amount;
    await this.save();
    
    // Log the transaction
    if (this.sequelize.models.Transaction) {
      await this.sequelize.models.Transaction.create({
        user_id: this.id,
        type: 'ticket_use',
        amount: -amount,
        balance_after: this.tickets,
        description: reason || 'Tickets used'
      });
    }
    
    return this.tickets;
  };

  // Get Market Mover stats
  User.prototype.getMarketMoverStats = function() {
    return {
      votes_cast: this.market_mover_votes_cast || 0,
      bid_up_wins: this.market_mover_wins || 0,
      ownership_checks: this.ownership_checks_made || 0,
      tickets: this.tickets || 0,
      vote_success_rate: this.market_mover_votes_cast > 0 
        ? ((this.market_mover_wins / this.market_mover_votes_cast) * 100).toFixed(1)
        : 0
    };
  };

  // Check if user has enough tickets
  User.prototype.hasTickets = function(amount = 1) {
    return (this.tickets || 0) >= amount;
  };

  // Award achievement tickets
  User.prototype.awardAchievementTickets = async function(achievementType) {
    const ticketRewards = {
      first_vote: 2,
      vote_streak_7: 5,
      bid_up_winner: 10,
      ownership_master: 3,
      market_mover_champion: 20
    };
    
    const amount = ticketRewards[achievementType];
    if (amount) {
      await this.addTickets(amount, `Achievement: ${achievementType}`);
      this.achievement_points = (this.achievement_points || 0) + (amount * 10);
      await this.save();
    }
  };

  User.prototype.updateStats = async function() {
    // Calculate win rate
    if (this.total_contests_entered > 0) {
      this.win_rate = (this.total_contests_won / this.total_contests_entered) * 100;
    }
    
    // Update Market Mover vote success rate can be calculated here if needed
    
    await this.save();
  };

  // Class methods
  User.getLeaderboard = async function(type = 'points', limit = 10) {
    const orderBy = {
      points: 'achievement_points',
      wins: 'total_contests_won',
      earnings: 'total_prize_money',
      score: 'highest_score',
      votes: 'market_mover_votes_cast',
      'bid-ups': 'market_mover_wins'
    }[type] || 'achievement_points';

    return await User.findAll({
      where: { is_active: true },
      attributes: ['id', 'username', 'selected_avatar', 'selected_badge', orderBy],
      order: [[orderBy, 'DESC']],
      limit
    });
  };

  return User;
};