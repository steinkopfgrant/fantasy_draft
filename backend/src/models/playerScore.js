// backend/src/models/PlayerScore.js
'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class PlayerScore extends Model {
    // No associations needed - uses player_name/player_team instead of player_id
    
    /**
     * Get score breakdown from stats JSONB
     */
    getBreakdown() {
      return this.stats || {};
    }
    
    /**
     * Check if score is finalized
     */
    isFinal() {
      return this.status === 'final';
    }
  }
  
  PlayerScore.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    player_name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    player_team: {
      type: DataTypes.STRING(10),
      allowNull: false
    },
    week: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    season: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 2024
    },
    stats: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {}
    },
    fantasy_points: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'pending',
      validate: {
        isIn: [['pending', 'final']]
      }
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    sequelize,
    modelName: 'PlayerScore',
    tableName: 'player_scores',
    underscored: true,
    timestamps: false
  });
  
  return PlayerScore;
};