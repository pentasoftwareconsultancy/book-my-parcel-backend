export const up = async (queryInterface, Sequelize) => {
  await queryInterface.addColumn('traveller_profiles', 'last_known_location', {
    type: Sequelize.GEOMETRY('POINT'),
    allowNull: true,
  });
};

export const down = async (queryInterface, Sequelize) => {
  await queryInterface.removeColumn('traveller_profiles', 'last_known_location');
};