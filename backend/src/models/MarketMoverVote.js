// backend/src/models/MarketMoverVote.js
module.exports = (sequelize, DataTypes) => {
  const MarketMoverVote = sequelize.define('MarketMoverVote', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    vote_period_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'vote_periods',
        key: 'id'
      }
    },
    player_name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    player_id: {
      type: DataTypes.STRING,
      allowNull: false
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'market_mover_votes',
    timestamps: false,
    indexes: [
      {
        unique: true,
        fields: ['user_id', 'vote_period_id']
      },
      {
        fields: ['vote_period_id', 'player_name']
      },
      {
        fields: ['created_at']
      }
    ]
  });

  MarketMoverVote.associate = function(models) {
    MarketMoverVote.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    });
    
    MarketMoverVote.belongsTo(models.VotePeriod, {
      foreignKey: 'vote_period_id',
      as: 'votePeriod'
    });
  };

  return MarketMoverVote;
};

// backend/src/models/MarketMoverBidUp.js
module.exports = (sequelize, DataTypes) => {
  const MarketMoverBidUp = sequelize.define('MarketMoverBidUp', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    player_name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    vote_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    vote_period_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'vote_periods',
        key: 'id'
      }
    },
    boost_percentage: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 35.00
    },
    status: {
      type: DataTypes.ENUM('active', 'expired', 'cancelled'),
      defaultValue: 'active'
    },
    starts_at: {
      type: DataTypes.DATE,
      allowNull: false
    },
    ends_at: {
      type: DataTypes.DATE,
      allowNull: false
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'market_mover_bid_ups',
    timestamps: false,
    indexes: [
      {
        fields: ['player_name']
      },
      {
        fields: ['status', 'starts_at', 'ends_at']
      },
      {
        fields: ['vote_period_id']
      }
    ]
  });

  MarketMoverBidUp.associate = function(models) {
    MarketMoverBidUp.belongsTo(models.VotePeriod, {
      foreignKey: 'vote_period_id',
      as: 'votePeriod'
    });
  };

  return MarketMoverBidUp;
};

// backend/src/models/VotePeriod.js
module.exports = (sequelize, DataTypes) => {
  const VotePeriod = sequelize.define('VotePeriod', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    period_start: {
      type: DataTypes.DATE,
      allowNull: false
    },
    period_end: {
      type: DataTypes.DATE,
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('active', 'completed', 'cancelled'),
      defaultValue: 'active'
    },
    winning_player: {
      type: DataTypes.STRING,
      allowNull: true
    },
    total_votes: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'vote_periods',
    timestamps: false,
    indexes: [
      {
        unique: true,
        fields: ['period_start', 'period_end']
      },
      {
        fields: ['status']
      },
      {
        fields: ['period_start']
      }
    ]
  });

  VotePeriod.associate = function(models) {
    VotePeriod.hasMany(models.MarketMoverVote, {
      foreignKey: 'vote_period_id',
      as: 'votes'
    });
    
    VotePeriod.hasMany(models.MarketMoverBidUp, {
      foreignKey: 'vote_period_id',
      as: 'bidUps'
    });
  };

  return VotePeriod;
};

// backend/src/models/TicketTransaction.js (Enhanced)
module.exports = (sequelize, DataTypes) => {
  const TicketTransaction = sequelize.define('TicketTransaction', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    type: {
      type: DataTypes.ENUM(
        'purchase',
        'earned_weekly',
        'earned_draft_completion',
        'earned_achievement',
        'used_vote',
        'used_ownership_check',
        'admin_adjustment'
      ),
      allowNull: false
    },
    amount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'Positive for earning, negative for spending'
    },
    balance_after: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    reference_id: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'Reference to related entity (contest, achievement, etc.)'
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'ticket_transactions',
    timestamps: false,
    indexes: [
      {
        fields: ['user_id', 'created_at']
      },
      {
        fields: ['type']
      },
      {
        fields: ['reference_id']
      }
    ]
  });

  TicketTransaction.associate = function(models) {
    TicketTransaction.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    });
  };

  return TicketTransaction;
};