export async function up(queryInterface, Sequelize) {
  await queryInterface.createTable("parcel_acceptances", {
    id: {
      type: Sequelize.UUID,
      primaryKey: true,
      defaultValue: Sequelize.UUIDV4,
    },
    parcel_request_id: {
      type: Sequelize.UUID,
      allowNull: false,
      unique: true,
      references: {
        model: "parcel_requests",
        key: "id",
      },
      onDelete: "CASCADE",
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
    accepted_at: {
      type: Sequelize.DATE,
      defaultValue: Sequelize.NOW,
    },
    acceptance_price: {
      type: Sequelize.DECIMAL(10, 2),
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

  await queryInterface.addIndex("parcel_acceptances", ["parcel_id"], {
    name: "idx_parcel_acceptances_parcel_id",
  });
  await queryInterface.addIndex("parcel_acceptances", ["traveller_id"], {
    name: "idx_parcel_acceptances_traveller_id",
  });
  await queryInterface.addIndex("parcel_acceptances", ["parcel_request_id"], {
    name: "idx_parcel_acceptances_parcel_request_id",
  });
}

export async function down(queryInterface, Sequelize) {
  await queryInterface.dropTable("parcel_acceptances");
}
