// backend/src/db/migrations/20260126000000-add-payment-fields.js
// Migration to add payment-related fields and tables
//
// Run with: npx sequelize-cli db:migrate
// Rollback: npx sequelize-cli db:migrate:undo

'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      console.log('🔄 Starting payment fields migration...');

      // ============================================
      // 1. UPDATE USERS TABLE
      // ============================================
      const userColumns = await queryInterface.describeTable('users');

      if (!userColumns.stripe_customer_id) {
        await queryInterface.addColumn('users', 'stripe_customer_id', {
          type: Sequelize.STRING(255),
          allowNull: true,
          unique: true
        }, { transaction });
        console.log('  ✅ Added users.stripe_customer_id');
      }

      if (!userColumns.lifetime_deposits) {
        await queryInterface.addColumn('users', 'lifetime_deposits', {
          type: Sequelize.DECIMAL(12, 2),
          defaultValue: 0
        }, { transaction });
        console.log('  ✅ Added users.lifetime_deposits');
      }

      if (!userColumns.lifetime_withdrawals) {
        await queryInterface.addColumn('users', 'lifetime_withdrawals', {
          type: Sequelize.DECIMAL(12, 2),
          defaultValue: 0
        }, { transaction });
        console.log('  ✅ Added users.lifetime_withdrawals');
      }

      if (!userColumns.withdrawal_eligible) {
        await queryInterface.addColumn('users', 'withdrawal_eligible', {
          type: Sequelize.BOOLEAN,
          defaultValue: false
        }, { transaction });
        console.log('  ✅ Added users.withdrawal_eligible');
      }

      // ============================================
      // 2. UPDATE TRANSACTIONS TABLE
      // ============================================
      const txColumns = await queryInterface.describeTable('transactions');

      if (!txColumns.stripe_payment_intent_id) {
        await queryInterface.addColumn('transactions', 'stripe_payment_intent_id', {
          type: Sequelize.STRING(255),
          allowNull: true
        }, { transaction });
        console.log('  ✅ Added transactions.stripe_payment_intent_id');
      }

      if (!txColumns.stripe_charge_id) {
        await queryInterface.addColumn('transactions', 'stripe_charge_id', {
          type: Sequelize.STRING(255),
          allowNull: true
        }, { transaction });
        console.log('  ✅ Added transactions.stripe_charge_id');
      }

      if (!txColumns.status) {
        await queryInterface.addColumn('transactions', 'status', {
          type: Sequelize.STRING(20),
          defaultValue: 'completed'
        }, { transaction });
        console.log('  ✅ Added transactions.status');

        // Backfill existing transactions as completed
        await queryInterface.sequelize.query(
          `UPDATE transactions SET status = 'completed' WHERE status IS NULL`,
          { transaction }
        );
      }

      if (!txColumns.metadata) {
        await queryInterface.addColumn('transactions', 'metadata', {
          type: Sequelize.JSONB,
          allowNull: true,
          defaultValue: {}
        }, { transaction });
        console.log('  ✅ Added transactions.metadata');
      }

      if (!txColumns.idempotency_key) {
        await queryInterface.addColumn('transactions', 'idempotency_key', {
          type: Sequelize.STRING(255),
          allowNull: true,
          unique: true
        }, { transaction });
        console.log('  ✅ Added transactions.idempotency_key');
      }

      // ============================================
      // 3. CREATE WITHDRAWAL_REQUESTS TABLE
      // ============================================
      const tables = await queryInterface.showAllTables();

      if (!tables.includes('withdrawal_requests')) {
        await queryInterface.createTable('withdrawal_requests', {
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.UUIDV4,
            primaryKey: true
          },
          user_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'users', key: 'id' },
            onDelete: 'CASCADE'
          },
          amount: {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: false
          },
          status: {
            type: Sequelize.ENUM(
              'pending',
              'approved',
              'processing',
              'completed',
              'rejected',
              'cancelled',
              'failed'
            ),
            defaultValue: 'pending'
          },
          payout_method: {
            type: Sequelize.STRING(50),
            defaultValue: 'bank_transfer'
          },
          stripe_payout_id: {
            type: Sequelize.STRING(255),
            allowNull: true
          },
          stripe_transfer_id: {
            type: Sequelize.STRING(255),
            allowNull: true
          },
          rejection_reason: {
            type: Sequelize.TEXT,
            allowNull: true
          },
          admin_notes: {
            type: Sequelize.TEXT,
            allowNull: true
          },
          reviewed_by: {
            type: Sequelize.UUID,
            allowNull: true,
            references: { model: 'users', key: 'id' }
          },
          reviewed_at: {
            type: Sequelize.DATE,
            allowNull: true
          },
          completed_at: {
            type: Sequelize.DATE,
            allowNull: true
          },
          metadata: {
            type: Sequelize.JSONB,
            allowNull: true,
            defaultValue: {}
          },
          created_at: {
            type: Sequelize.DATE,
            defaultValue: Sequelize.NOW
          },
          updated_at: {
            type: Sequelize.DATE,
            defaultValue: Sequelize.NOW
          }
        }, { transaction });

        // Add indexes
        await queryInterface.addIndex('withdrawal_requests', ['user_id'], { transaction });
        await queryInterface.addIndex('withdrawal_requests', ['status'], { transaction });
        await queryInterface.addIndex('withdrawal_requests', ['created_at'], { transaction });

        console.log('  ✅ Created withdrawal_requests table');
      }

      // ============================================
      // 4. CREATE PAYMENT_METHODS TABLE (optional)
      // ============================================
      if (!tables.includes('payment_methods')) {
        await queryInterface.createTable('payment_methods', {
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.UUIDV4,
            primaryKey: true
          },
          user_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'users', key: 'id' },
            onDelete: 'CASCADE'
          },
          stripe_payment_method_id: {
            type: Sequelize.STRING(255),
            allowNull: false,
            unique: true
          },
          type: {
            type: Sequelize.STRING(50),
            defaultValue: 'card'
          },
          last_four: {
            type: Sequelize.STRING(4),
            allowNull: false
          },
          brand: {
            type: Sequelize.STRING(50),
            allowNull: true
          },
          exp_month: {
            type: Sequelize.INTEGER,
            allowNull: true
          },
          exp_year: {
            type: Sequelize.INTEGER,
            allowNull: true
          },
          is_default: {
            type: Sequelize.BOOLEAN,
            defaultValue: false
          },
          bank_name: {
            type: Sequelize.STRING(255),
            allowNull: true
          },
          created_at: {
            type: Sequelize.DATE,
            defaultValue: Sequelize.NOW
          },
          updated_at: {
            type: Sequelize.DATE,
            defaultValue: Sequelize.NOW
          }
        }, { transaction });

        await queryInterface.addIndex('payment_methods', ['user_id'], { transaction });

        console.log('  ✅ Created payment_methods table');
      }

      // ============================================
      // 5. ADD INDEXES FOR PAYMENT LOOKUPS
      // ============================================
      try {
        await queryInterface.addIndex('transactions', ['stripe_payment_intent_id'], {
          name: 'idx_transactions_stripe_pi',
          transaction
        });
        console.log('  ✅ Added index on transactions.stripe_payment_intent_id');
      } catch (e) {
        if (!e.message.includes('already exists')) {
          console.log('  ℹ️ Index already exists: idx_transactions_stripe_pi');
        }
      }

      try {
        await queryInterface.addIndex('transactions', ['status'], {
          name: 'idx_transactions_status',
          transaction
        });
        console.log('  ✅ Added index on transactions.status');
      } catch (e) {
        if (!e.message.includes('already exists')) {
          console.log('  ℹ️ Index already exists: idx_transactions_status');
        }
      }

      try {
        await queryInterface.addIndex('transactions', ['user_id', 'type', 'status'], {
          name: 'idx_transactions_user_type_status',
          transaction
        });
        console.log('  ✅ Added composite index on transactions');
      } catch (e) {
        // Might already exist
      }

      await transaction.commit();
      console.log('✅ Payment fields migration complete!');

    } catch (error) {
      await transaction.rollback();
      console.error('❌ Migration failed:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      console.log('🔄 Rolling back payment fields migration...');

      // Drop tables
      await queryInterface.dropTable('payment_methods', { transaction });
      await queryInterface.dropTable('withdrawal_requests', { transaction });

      // Remove transaction columns
      await queryInterface.removeColumn('transactions', 'stripe_payment_intent_id', { transaction });
      await queryInterface.removeColumn('transactions', 'stripe_charge_id', { transaction });
      await queryInterface.removeColumn('transactions', 'status', { transaction });
      await queryInterface.removeColumn('transactions', 'metadata', { transaction });
      await queryInterface.removeColumn('transactions', 'idempotency_key', { transaction });

      // Remove user columns
      await queryInterface.removeColumn('users', 'stripe_customer_id', { transaction });
      await queryInterface.removeColumn('users', 'lifetime_deposits', { transaction });
      await queryInterface.removeColumn('users', 'lifetime_withdrawals', { transaction });
      await queryInterface.removeColumn('users', 'withdrawal_eligible', { transaction });

      await transaction.commit();
      console.log('✅ Rollback complete');

    } catch (error) {
      await transaction.rollback();
      console.error('❌ Rollback failed:', error);
      throw error;
    }
  }
};