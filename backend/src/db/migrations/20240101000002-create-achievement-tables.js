// backend/src/db/migrations/20240101000002-create-achievement-tables.js
'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      // Create achievements table
      await queryInterface.createTable('achievements', {
        id: {
          type: Sequelize.STRING,
          primaryKey: true,
          allowNull: false
        },
        name: {
          type: Sequelize.STRING(100),
          allowNull: false,
          unique: true
        },
        description: {
          type: Sequelize.TEXT,
          allowNull: false
        },
        icon: {
          type: Sequelize.STRING(255),
          allowNull: true
        },
        category: {
          type: Sequelize.ENUM('draft', 'win', 'participation', 'special', 'milestone'),
          allowNull: false
        },
        points: {
          type: Sequelize.INTEGER,
          defaultValue: 10
        },
        requirement_type: {
          type: Sequelize.ENUM('count', 'streak', 'unique', 'threshold'),
          allowNull: false
        },
        requirement_value: {
          type: Sequelize.INTEGER,
          allowNull: false
        },
        reward_type: {
          type: Sequelize.ENUM('badge', 'avatar', 'emote', 'clothing', 'title'),
          allowNull: false
        },
        reward_data: {
          type: Sequelize.JSONB,
          allowNull: true
        },
        is_active: {
          type: Sequelize.BOOLEAN,
          defaultValue: true
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.NOW
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.NOW
        }
      }, { transaction });
      
      // Create user_achievements table
      await queryInterface.createTable('user_achievements', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true
        },
        user_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: {
            model: 'users',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        achievement_id: {
          type: Sequelize.STRING,
          allowNull: false,
          references: {
            model: 'achievements',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        progress: {
          type: Sequelize.INTEGER,
          defaultValue: 0
        },
        completed: {
          type: Sequelize.BOOLEAN,
          defaultValue: false
        },
        completed_at: {
          type: Sequelize.DATE,
          allowNull: true
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.NOW
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.NOW
        }
      }, { transaction });
      
      // Add indexes
      await queryInterface.addIndex('user_achievements', ['user_id'], { transaction });
      await queryInterface.addIndex('user_achievements', ['achievement_id'], { transaction });
      await queryInterface.addIndex('user_achievements', ['user_id', 'achievement_id'], {
        unique: true,
        transaction
      });
      await queryInterface.addIndex('user_achievements', ['completed'], { transaction });
      await queryInterface.addIndex('achievements', ['category'], { transaction });
      await queryInterface.addIndex('achievements', ['is_active'], { transaction });
      
      await transaction.commit();
      console.log('✅ Achievement tables created successfully');
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      // Drop tables in reverse order
      await queryInterface.dropTable('user_achievements', { transaction });
      await queryInterface.dropTable('achievements', { transaction });
      
      await transaction.commit();
      console.log('✅ Achievement tables dropped successfully');
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
};