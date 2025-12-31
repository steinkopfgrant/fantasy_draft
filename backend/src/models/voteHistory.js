// backend/src/models/voteHistory.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const VoteHistory = sequelize.define('VoteHistory', {
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
    player_id: {
      type: DataTypes.STRING,
      allowNull: false
    },
    player_name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    player_team: {
      type: DataTypes.STRING,
      allowNull: false
    },
    vote_period_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'vote_periods',
        key: 'id'
      }
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'vote_history',
    timestamps: false,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ['user_id', 'vote_period_id']
      }
    ]
  });

  return VoteHistory;
};