export const up = async (queryInterface, Sequelize) => {
  await queryInterface.addColumn('booking', 'pickup_otp', {
    type: Sequelize.STRING(4),
    allowNull: true,
  });
  
  await queryInterface.addColumn('booking', 'delivery_otp', {
    type: Sequelize.STRING(4),
    allowNull: true,
  });
};

export const down = async (queryInterface, Sequelize) => {
  await queryInterface.removeColumn('booking', 'pickup_otp');
  await queryInterface.removeColumn('booking', 'delivery_otp');
};