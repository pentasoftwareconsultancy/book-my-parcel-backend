export const up = async (queryInterface, Sequelize) => {
  await queryInterface.createTable("route_places", {
    id: {
      type: Sequelize.UUID,
      primaryKey: true,
      defaultValue: Sequelize.literal("gen_random_uuid()"),
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
    place_id: {
      type: Sequelize.STRING(500),
      allowNull: false,
    },
    place_type: {
      type: Sequelize.STRING(50),
      allowNull: false,
    },
    place_name: {
      type: Sequelize.STRING(255),
      allowNull: true,
    },
    latitude: {
      type: Sequelize.DECIMAL(10, 8),
      allowNull: true,
    },
    longitude: {
      type: Sequelize.DECIMAL(11, 8),
      allowNull: true,
    },
    created_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal("NOW()"),
    },
  });

  await queryInterface.addIndex("route_places", ["route_id"], {
    name: "idx_route_places_route_id",
  });

  await queryInterface.addIndex("route_places", ["place_id"], {
    name: "idx_route_places_place_id",
  });

  await queryInterface.addIndex("route_places", ["place_type"], {
    name: "idx_route_places_type",
  });

  await queryInterface.addIndex("route_places", ["route_id", "place_type"], {
    name: "idx_route_places_route_type",
  });

  await queryInterface.sequelize.query(
    `COMMENT ON TABLE route_places IS 'Stores Google Place IDs for each place (locality, city, taluka, pincode, landmark) associated with a route. Enables exact, unambiguous matching.';`
  );
  await queryInterface.sequelize.query(
    `COMMENT ON COLUMN route_places.place_id IS 'Google Place ID for the location';`
  );
  await queryInterface.sequelize.query(
    `COMMENT ON COLUMN route_places.place_type IS 'Type of place: locality, city, taluka, pincode, landmark';`
  );
  await queryInterface.sequelize.query(
    `COMMENT ON COLUMN route_places.place_name IS 'Human-readable name of the place';`
  );
};

export const down = async (queryInterface) => {
  await queryInterface.dropTable("route_places");
};
