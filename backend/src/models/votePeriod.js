// backend/src/models/votePeriod.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const VotePeriod = sequelize.define('VotePeriod', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    start_time: {
      type: DataTypes.DATE,
      allowNull: false
    },
    end_time: {
      type: DataTypes.DATE,
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('active', 'completed'),
      defaultValue: 'active'
    },
    winner_player_id: {
      type: DataTypes.STRING,
      allowNull: true
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'vote_periods',
    timestamps: false,
    underscored: true
  });

  return VotePeriod;
};