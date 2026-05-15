export const up = async (queryInterface, Sequelize) => {
  // Add transport_mode column to traveller_routes table
  await queryInterface.addColumn('traveller_routes', 'transport_mode', {
    type: Sequelize.ENUM('private', 'bus', 'train'),
    defaultValue: 'private',
    allowNull: true,
    comment: 'Transportation mode: private vehicle, bus, or train'
  });
};

export const down = async (queryInterface, Sequelize) => {
  // Remove transport_mode column
  await queryInterface.removeColumn('traveller_routes', 'transport_mode');
};
