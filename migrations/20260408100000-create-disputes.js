export const up = async (queryInterface, Sequelize) => {
  try {
    // Drop table if it exists (cleanup from partial creation)
    await queryInterface.dropTable("disputes", { cascade: true }).catch(() => {
      // Table might not exist, that's ok
    });

    // Create the table with all columns properly defined
    await queryInterface.createTable("disputes", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
      },
      booking_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "booking", key: "id" },
        onDelete: "CASCADE",
      },
      raised_by: {
        type: Sequelize.UUID,
        allowNull: false,
      },
      role: {
        type: Sequelize.ENUM("USER", "TRAVELLER"),
        allowNull: false,
      },
      dispute_type: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      status: {
        type: Sequelize.ENUM("OPEN", "IN_PROGRESS", "RESOLVED"),
        defaultValue: "OPEN",
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("NOW()"),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("NOW()"),
      },
    });

    // Add indexes
    await queryInterface.addIndex("disputes", ["raised_by"], {
      name: "idx_disputes_raised_by",
    });
    await queryInterface.addIndex("disputes", ["booking_id"], {
      name: "idx_disputes_booking_id",
    });

    console.log("✅ Created disputes table with indexes");
  } catch (error) {
    console.error("❌ Error in disputes migration:", error.message);
    throw error;
  }
};

export const down = async (queryInterface) => {
  await queryInterface.dropTable("disputes", { cascade: true });
};
