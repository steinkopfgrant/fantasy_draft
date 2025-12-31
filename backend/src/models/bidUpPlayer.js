// backend/src/models/bidUpPlayer.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const BidUpPlayer = sequelize.define('BidUpPlayer', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
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
    player_position: {
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
    },
    status: {
      type: DataTypes.ENUM('active', 'completed'),
      defaultValue: 'active'
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'bid_up_players',
    timestamps: false,
    underscored: true
  });

  return BidUpPlayer;
};