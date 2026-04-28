/** @type {import('sequelize-cli').Migration} */
export const up = async (queryInterface, Sequelize) => {
  await queryInterface.createTable("notifications", {
    id: {
      type: Sequelize.UUID,
      defaultValue: Sequelize.literal("gen_random_uuid()"),
      primaryKey: true,
    },
    user_id: {
      type: Sequelize.UUID,
      allowNull: false,
    },
    role: {
      type: Sequelize.ENUM("user", "traveller", "admin"),
      allowNull: false,
    },
    type_code: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    title: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    message: {
      type: Sequelize.TEXT,
      allowNull: false,
    },
    is_read: {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
    },
    meta: {
      type: Sequelize.JSONB,
      allowNull: true,
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

  // Composite index: user_id + role (main fetch query)
  await queryInterface.addIndex("notifications", ["user_id", "role"], {
    name: "idx_notifications_user_role",
  });

  // Composite index: user_id + is_read (unread count / filter)
  await queryInterface.addIndex("notifications", ["user_id", "is_read"], {
    name: "idx_notifications_user_read",
  });

  // Index on created_at for ORDER BY DESC
  await queryInterface.addIndex("notifications", ["created_at"], {
    name: "idx_notifications_created_at",
  });
};

export const down = async (queryInterface) => {
  await queryInterface.dropTable("notifications");
};
