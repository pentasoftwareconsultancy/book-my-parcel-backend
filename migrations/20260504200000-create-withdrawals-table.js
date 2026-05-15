export async function up(queryInterface, Sequelize) {
    await queryInterface.createTable('withdrawals', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED'),
        defaultValue: 'PENDING',
        allowNull: false,
      },
      bank_account_id: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },
      bank_name: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      ifsc_code: {
        type: Sequelize.STRING(11),
        allowNull: true,
      },
      account_holder: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      transaction_id: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      requested_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
        allowNull: false,
      },
      processed_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      failure_reason: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
    });

    // Create indexes
    await queryInterface.addIndex('withdrawals', ['user_id'], {
      name: 'idx_withdrawals_user_id',
    });

    await queryInterface.addIndex('withdrawals', ['status'], {
      name: 'idx_withdrawals_status',
    });

    await queryInterface.addIndex('withdrawals', ['requested_at'], {
      name: 'idx_withdrawals_requested_at',
    });

    await queryInterface.addIndex('withdrawals', ['user_id', 'requested_at'], {
      name: 'idx_withdrawals_user_requested',
    });
}

export async function down(queryInterface, Sequelize) {
  await queryInterface.dropTable('withdrawals');
}
