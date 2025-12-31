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
    start_time: {
      type: DataTypes.DATE,
      allowNull: false
    },
    end_time: {
      type: DataTypes.DATE,
      allowNull: false
    },
    boost_percentage: {
      type: DataTypes.INTEGER,
      defaultValue: 35
    }
  }, {
    tableName: 'market_mover_bid_ups',
    underscored: true
  });

  return MarketMoverBidUp;
};

// backend/src/models/MarketMoverCircuitBreaker.js
module.exports = (sequelize, DataTypes) => {
  const MarketMoverCircuitBreaker = sequelize.define('MarketMoverCircuitBreaker', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    player_name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    start_time: {
      type: DataTypes.DATE,
      allowNull: false
    },
    end_time: {
      type: DataTypes.DATE,
      allowNull: false
    }
  }, {
    tableName: 'market_mover_circuit_breakers',
    underscored: true
  });

  return MarketMoverCircuitBreaker;
};

// Update the MarketMoverVote model to include voting period
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
      allowNull: false
    },
    player_name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    vote_time: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    voting_period_start: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    tableName: 'market_mover_votes',
    underscored: true
  });

  MarketMoverVote.associate = function(models) {
    MarketMoverVote.belongsTo(models.User, {
      foreignKey: 'user_id'
    });
  };

  return MarketMoverVote;
};