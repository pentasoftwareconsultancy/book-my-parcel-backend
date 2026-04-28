export const up = async (queryInterface, Sequelize) => {
  await queryInterface.createTable("parcel_requests", {
    id: {
      type: Sequelize.UUID,
      primaryKey: true,
      defaultValue: Sequelize.UUIDV4,
    },
    parcel_id: {
      type: Sequelize.UUID,
      allowNull: false,
      references: {
        model: "parcel",
        key: "id",
      },
      onDelete: "CASCADE",
    },
    traveller_id: {
      type: Sequelize.UUID,
      allowNull: false,
    },
    route_id: {
      type: Sequelize.UUID,
      allowNull: false,
      references: {
        model: "traveller_routes",
        key: "id",
      },
      onDelete: "CASCADE",
    },
    match_score: {
      type: Sequelize.DECIMAL(5, 2),
      allowNull: true,
    },
    detour_km: {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
    },
    detour_percentage: {
      type: Sequelize.DECIMAL(5, 2),
      allowNull: true,
    },
    status: {
      type: Sequelize.ENUM("SENT", "ACCEPTED", "REJECTED", "EXPIRED"),
      defaultValue: "SENT",
    },
    sent_at: {
      type: Sequelize.DATE,
      defaultValue: Sequelize.NOW,
    },
    expires_at: {
      type: Sequelize.DATE,
      allowNull: true,
    },
    responded_at: {
      type: Sequelize.DATE,
      allowNull: true,
    },
    created_at: {
      type: Sequelize.DATE,
      defaultValue: Sequelize.NOW,
    },
    updated_at: {
      type: Sequelize.DATE,
      defaultValue: Sequelize.NOW,
    },
  });

  await queryInterface.addIndex("parcel_requests", ["parcel_id"], {
    name: "idx_parcel_requests_parcel_id",
  });
  await queryInterface.addIndex("parcel_requests", ["traveller_id"], {
    name: "idx_parcel_requests_traveller_id",
  });
  await queryInterface.addIndex("parcel_requests", ["status"], {
    name: "idx_parcel_requests_status",
  });
  await queryInterface.addIndex("parcel_requests", ["expires_at"], {
    name: "idx_parcel_requests_expires_at",
  });
  await queryInterface.addIndex("parcel_requests", ["route_id"], {
    name: "idx_parcel_requests_route_id",
  });
};

export const down = async (queryInterface, Sequelize) => {
  await queryInterface.dropTable("parcel_requests");
};
