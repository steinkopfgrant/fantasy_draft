// backend/src/migrations/YYYYMMDDHHMMSS-enhance-transactions-table.js
// Run: npx sequelize-cli db:migrate
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // First, check if table exists
    const tableExists = await queryInterface.sequelize.query(
      `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'transactions');`,
      { type: Sequelize.QueryTypes.SELECT }
    );

    if (tableExists[0].exists) {
      // Table exists - add new columns if they don't exist
      console.log('Transactions table exists, checking for missing columns...');

      // Get existing columns
      const [columns] = await queryInterface.sequelize.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'transactions';`
      );
      const existingColumns = columns.map(c => c.column_name);

      // Add balance_before if missing
      if (!existingColumns.includes('balance_before')) {
        await queryInterface.addColumn('transactions', 'balance_before', {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: true // Allow null for existing records
        });
        console.log('Added balance_before column');
      }

      // Add reference_type if missing
      if (!existingColumns.includes('reference_type')) {
        await queryInterface.addColumn('transactions', 'reference_type', {
          type: Sequelize.STRING(50),
          allowNull: true
        });
        console.log('Added reference_type column');
      }

      // Add reference_id if missing (might exist as different column)
      if (!existingColumns.includes('reference_id')) {
        await queryInterface.addColumn('transactions', 'reference_id', {
          type: Sequelize.STRING(255),
          allowNull: true
        });
        console.log('Added reference_id column');
      }

      // Add admin_user_id if missing
      if (!existingColumns.includes('admin_user_id')) {
        await queryInterface.addColumn('transactions', 'admin_user_id', {
          type: Sequelize.UUID,
          allowNull: true,
          references: {
            model: 'users',
            key: 'id'
          }
        });
        console.log('Added admin_user_id column');
      }

      // Add metadata if missing
      if (!existingColumns.includes('metadata')) {
        await queryInterface.addColumn('transactions', 'metadata', {
          type: Sequelize.JSONB,
          defaultValue: {}
        });
        console.log('Added metadata column');
      }

      // Add idempotency_key if missing
      if (!existingColumns.includes('idempotency_key')) {
        await queryInterface.addColumn('transactions', 'idempotency_key', {
          type: Sequelize.STRING(255),
          allowNull: true,
          unique: true
        });
        console.log('Added idempotency_key column');
      }

      // Update type enum to include all transaction types
      // Note: This requires recreating the enum in PostgreSQL
      await queryInterface.sequelize.query(`
        DO $$ 
        BEGIN
          -- Add new enum values if they don't exist
          BEGIN
            ALTER TYPE enum_transactions_type ADD VALUE IF NOT EXISTS 'entry_fee';
          EXCEPTION WHEN duplicate_object THEN NULL;
          END;
          
          BEGIN
            ALTER TYPE enum_transactions_type ADD VALUE IF NOT EXISTS 'entry_refund';
          EXCEPTION WHEN duplicate_object THEN NULL;
          END;
          
          BEGIN
            ALTER TYPE enum_transactions_type ADD VALUE IF NOT EXISTS 'contest_winnings';
          EXCEPTION WHEN duplicate_object THEN NULL;
          END;
          
          BEGIN
            ALTER TYPE enum_transactions_type ADD VALUE IF NOT EXISTS 'promo_credit';
          EXCEPTION WHEN duplicate_object THEN NULL;
          END;
          
          BEGIN
            ALTER TYPE enum_transactions_type ADD VALUE IF NOT EXISTS 'adjustment';
          EXCEPTION WHEN duplicate_object THEN NULL;
          END;
        END $$;
      `).catch(() => {
        console.log('Enum type might not exist or values already present');
      });

    } else {
      // Table doesn't exist - create it fresh
      console.log('Creating transactions table...');
      
      await queryInterface.createTable('transactions', {
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
          onDelete: 'CASCADE'
        },
        type: {
          type: Sequelize.ENUM(
            'deposit',
            'withdrawal',
            'entry_fee',
            'entry_refund',
            'contest_winnings',
            'promo_credit',
            'adjustment'
          ),
          allowNull: false
        },
        amount: {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: false
        },
        balance_before: {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: false
        },
        balance_after: {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: false
        },
        reference_type: {
          type: Sequelize.STRING(50),
          allowNull: true
        },
        reference_id: {
          type: Sequelize.STRING(255),
          allowNull: true
        },
        description: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        admin_user_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: {
            model: 'users',
            key: 'id'
          }
        },
        metadata: {
          type: Sequelize.JSONB,
          defaultValue: {}
        },
        idempotency_key: {
          type: Sequelize.STRING(255),
          allowNull: true,
          unique: true
        },
        created_at: {
          type: Sequelize.DATE,
          defaultValue: Sequelize.NOW,
          allowNull: false
        }
      });

      console.log('Created transactions table');
    }

    // Create/update indexes
    console.log('Creating indexes...');

    // Index on user_id
    await queryInterface.addIndex('transactions', ['user_id'], {
      name: 'idx_transactions_user_id',
      concurrently: true
    }).catch(() => console.log('Index idx_transactions_user_id already exists'));

    // Index on type
    await queryInterface.addIndex('transactions', ['type'], {
      name: 'idx_transactions_type',
      concurrently: true
    }).catch(() => console.log('Index idx_transactions_type already exists'));

    // Index on reference
    await queryInterface.addIndex('transactions', ['reference_type', 'reference_id'], {
      name: 'idx_transactions_reference',
      concurrently: true
    }).catch(() => console.log('Index idx_transactions_reference already exists'));

    // Index on created_at for time-based queries
    await queryInterface.addIndex('transactions', ['created_at'], {
      name: 'idx_transactions_created_at',
      concurrently: true
    }).catch(() => console.log('Index idx_transactions_created_at already exists'));

    // Partial unique index on idempotency_key (only non-null values)
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_idempotency_key 
      ON transactions (idempotency_key) 
      WHERE idempotency_key IS NOT NULL;
    `).catch(() => console.log('Index idx_transactions_idempotency_key already exists'));

    console.log('Migration complete');
  },

  async down(queryInterface, Sequelize) {
    // Only drop if you really want to - this loses data!
    // For safety, we only remove added columns rather than drop table
    
    const columnsToRemove = [
      'balance_before',
      'reference_type', 
      'reference_id',
      'admin_user_id',
      'metadata',
      'idempotency_key'
    ];

    for (const col of columnsToRemove) {
      await queryInterface.removeColumn('transactions', col).catch(() => {
        console.log(`Column ${col} might not exist`);
      });
    }
  }
};