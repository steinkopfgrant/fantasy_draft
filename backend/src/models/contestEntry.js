// backend/src/models/contestEntry.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ContestEntry = sequelize.define('ContestEntry', {
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
    contest_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'contests',
        key: 'id'
      }
    },
    draft_room_id: {
      type: DataTypes.STRING,
      allowNull: false
    },
    draft_position: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        min: 0,
        max: 4
      }
    },
    status: {
      type: DataTypes.ENUM('pending', 'drafting', 'completed', 'cancelled'),
      defaultValue: 'pending'
    },
    roster: {
      type: DataTypes.JSONB,
      defaultValue: {}
    },
    lineup: {
      type: DataTypes.JSONB,
      defaultValue: []
    },
    total_spent: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      validate: {
        min: 0,
        max: 15
      }
    },
    total_points: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0
    },
    final_rank: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    prize_won: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0
    },
    entered_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    completed_at: {
      type: DataTypes.DATE,
      allowNull: true
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
    tableName: 'contest_entries',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ['draft_room_id', 'draft_position'],
        where: {
          status: {
            [sequelize.Sequelize.Op.ne]: 'cancelled'
          }
        }
      }
    ]
  });

  return ContestEntry;
};