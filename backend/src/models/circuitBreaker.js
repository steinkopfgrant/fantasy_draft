// backend/src/models/circuitBreaker.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const CircuitBreaker = sequelize.define('CircuitBreaker', {
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
    reduction_percentage: {
      type: DataTypes.INTEGER,
      defaultValue: 50
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'circuit_breakers',
    timestamps: false,
    underscored: true
  });

  return CircuitBreaker;
};