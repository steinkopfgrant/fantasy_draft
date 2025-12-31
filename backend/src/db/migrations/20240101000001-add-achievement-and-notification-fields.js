// backend/src/db/migrations/20240101000001-add-achievement-and-notification-fields.js
'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      // Add push notification fields
      await queryInterface.addColumn('users', 'push_subscription', {
        type: Sequelize.JSONB,
        allowNull: true
      }, { transaction });
      
      await queryInterface.addColumn('users', 'push_enabled', {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      }, { transaction });
      
      // Add achievement fields
      await queryInterface.addColumn('users', 'achievement_points', {
        type: Sequelize.INTEGER,
        defaultValue: 0
      }, { transaction });
      
      await queryInterface.addColumn('users', 'selected_badge', {
        type: Sequelize.STRING(50),
        allowNull: true
      }, { transaction });
      
      await queryInterface.addColumn('users', 'selected_title', {
        type: Sequelize.STRING(100),
        allowNull: true
      }, { transaction });
      
      await queryInterface.addColumn('users', 'selected_avatar', {
        type: Sequelize.STRING(255),
        allowNull: true
      }, { transaction });
      
      await queryInterface.addColumn('users', 'unlocked_emotes', {
        type: Sequelize.ARRAY(Sequelize.STRING),
        defaultValue: []
      }, { transaction });
      
      await queryInterface.addColumn('users', 'unlocked_avatars', {
        type: Sequelize.ARRAY(Sequelize.STRING),
        defaultValue: []
      }, { transaction });
      
      await queryInterface.addColumn('users', 'unlocked_badges', {
        type: Sequelize.ARRAY(Sequelize.STRING),
        defaultValue: []
      }, { transaction });
      
      // Add profile customization fields
      await queryInterface.addColumn('users', 'profile_color', {
        type: Sequelize.STRING(7),
        defaultValue: '#00d4ff'
      }, { transaction });
      
      await queryInterface.addColumn('users', 'bio', {
        type: Sequelize.TEXT,
        allowNull: true
      }, { transaction });
      
      // Add statistics fields
      await queryInterface.addColumn('users', 'total_contests_entered', {
        type: Sequelize.INTEGER,
        defaultValue: 0
      }, { transaction });
      
      await queryInterface.addColumn('users', 'total_contests_won', {
        type: Sequelize.INTEGER,
        defaultValue: 0
      }, { transaction });
      
      await queryInterface.addColumn('users', 'total_prize_money', {
        type: Sequelize.DECIMAL(10, 2),
        defaultValue: 0
      }, { transaction });
      
      await queryInterface.addColumn('users', 'highest_score', {
        type: Sequelize.DECIMAL(10, 2),
        defaultValue: 0
      }, { transaction });
      
      await queryInterface.addColumn('users', 'win_rate', {
        type: Sequelize.DECIMAL(5, 2),
        defaultValue: 0
      }, { transaction });
      
      // Add preference fields
      await queryInterface.addColumn('users', 'email_notifications', {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      }, { transaction });
      
      await queryInterface.addColumn('users', 'draft_reminders', {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      }, { transaction });
      
      await queryInterface.addColumn('users', 'contest_updates', {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      }, { transaction });
      
      await queryInterface.addColumn('users', 'sound_enabled', {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      }, { transaction });
      
      await queryInterface.addColumn('users', 'auto_pick_enabled', {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      }, { transaction });
      
      await transaction.commit();
      console.log('✅ User fields migration completed successfully');
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      // Remove all added columns in reverse order
      const columnsToRemove = [
        'push_subscription',
        'push_enabled',
        'achievement_points',
        'selected_badge',
        'selected_title',
        'selected_avatar',
        'unlocked_emotes',
        'unlocked_avatars',
        'unlocked_badges',
        'profile_color',
        'bio',
        'total_contests_entered',
        'total_contests_won',
        'total_prize_money',
        'highest_score',
        'win_rate',
        'email_notifications',
        'draft_reminders',
        'contest_updates',
        'sound_enabled',
        'auto_pick_enabled'
      ];
      
      for (const column of columnsToRemove) {
        await queryInterface.removeColumn('users', column, { transaction });
      }
      
      await transaction.commit();
      console.log('✅ User fields migration rolled back successfully');
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
};