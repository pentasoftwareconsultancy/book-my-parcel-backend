export const up = async (queryInterface, Sequelize) => {
  await queryInterface.createTable("user_device_tokens", {
    id: {
      type: Sequelize.UUID,
      primaryKey: true,
      defaultValue: Sequelize.UUIDV4,
    },
    user_id: {
      type: Sequelize.UUID,
      allowNull: false,
      references: {
        model: "users",
        key: "id",
      },
      onDelete: "CASCADE",
    },
    token: {
      type: Sequelize.TEXT,
      allowNull: false,
    },
    device_type: {
      type: Sequelize.STRING,
      defaultValue: "mobile",
    },
    created_at: {
      type: Sequelize.DATE,
      defaultValue: Sequelize.NOW,
    },
  });

  await queryInterface.addIndex("user_device_tokens", ["user_id"], {
    name: "idx_user_device_tokens_user_id",
  });
  await queryInterface.addIndex("user_device_tokens", ["token"], {
    name: "idx_user_device_tokens_token",
  });
};

export const down = async (queryInterface, Sequelize) => {
  await queryInterface.dropTable("user_device_tokens");
};
