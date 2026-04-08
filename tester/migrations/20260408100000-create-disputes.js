export const up = async (queryInterface, Sequelize) => {
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

  await queryInterface.addIndex("disputes", ["raised_by"]);
  await queryInterface.addIndex("disputes", ["booking_id"]);
};

export const down = async (queryInterface) => {
  await queryInterface.dropTable("disputes");
};
