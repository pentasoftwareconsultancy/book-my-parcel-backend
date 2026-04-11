export const up = async (queryInterface, Sequelize) => {
  await queryInterface.addColumn('traveller_profiles', 'rating', {
    type: Sequelize.DECIMAL(2, 1),
    defaultValue: 4.8,
    allowNull: false,
  });

  await queryInterface.addColumn('traveller_profiles', 'total_deliveries', {
    type: Sequelize.INTEGER,
    defaultValue: 0,
    allowNull: false,
  });

  await queryInterface.addColumn('traveller_profiles', 'profile_photo', {
    type: Sequelize.STRING,
    allowNull: true,
  });
};

export const down = async (queryInterface, Sequelize) => {
  await queryInterface.removeColumn('traveller_profiles', 'rating');
  await queryInterface.removeColumn('traveller_profiles', 'total_deliveries');
  await queryInterface.removeColumn('traveller_profiles', 'profile_photo');
};