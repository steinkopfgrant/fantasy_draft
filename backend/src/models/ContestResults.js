// backend/src/models/ContestResult.js
'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ContestResult extends Model {
    // NOTE: Associations are defined in models/index.js to avoid duplicates
    // Do NOT add an associate() method here
    
    /**
     * Check if this result is a winner (got paid)
     */
    isWinner() {
      return parseFloat(this.payout || 0) > 0;
    }
  }
  
  ContestResult.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    contest_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'contests',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    entry_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'contest_entries',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    final_rank: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    total_score: {
      type: DataTypes.DECIMAL(8, 2),
      allowNull: false,
      defaultValue: 0
    },
    payout: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0
    },
    settled_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    sequelize,
    modelName: 'ContestResult',
    tableName: 'contest_results',
    underscored: true,
    timestamps: false
  });
  
  return ContestResult;
};