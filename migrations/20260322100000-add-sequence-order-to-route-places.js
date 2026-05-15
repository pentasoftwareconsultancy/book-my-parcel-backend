// Migration to add sequence_order column to route_places table
export const up = async (queryInterface, Sequelize) => {
  await queryInterface.addColumn('route_places', 'sequence_order', {
    type: Sequelize.INTEGER,
    allowNull: true,
    comment: 'Order of this place in the route (0 = origin, higher = later in route)'
  });

  // Add index for better query performance
  await queryInterface.addIndex('route_places', ['route_id', 'sequence_order'], {
    name: 'idx_route_places_route_sequence'
  });

  console.log('✅ Added sequence_order column to route_places table');
};

export const down = async (queryInterface, Sequelize) => {
  await queryInterface.removeIndex('route_places', 'idx_route_places_route_sequence');
  await queryInterface.removeColumn('route_places', 'sequence_order');
  console.log('✅ Removed sequence_order column from route_places table');
};
