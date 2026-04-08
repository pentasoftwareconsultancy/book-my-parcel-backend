export async function up(queryInterface, Sequelize) {
  await queryInterface.addColumn('booking', 'pickup_otp_generated_at', {
    type: Sequelize.DATE,
    allowNull: true,
  });

  await queryInterface.addColumn('booking', 'pickup_otp_attempts', {
    type: Sequelize.INTEGER,
    defaultValue: 0,
    allowNull: false,
  });

  await queryInterface.addColumn('booking', 'pickup_verified_at', {
    type: Sequelize.DATE,
    allowNull: true,
  });

  await queryInterface.addColumn('booking', 'delivery_otp_generated_at', {
    type: Sequelize.DATE,
    allowNull: true,
  });

  await queryInterface.addColumn('booking', 'delivery_otp_attempts', {
    type: Sequelize.INTEGER,
    defaultValue: 0,
    allowNull: false,
  });

  await queryInterface.addColumn('booking', 'delivered_at', {
    type: Sequelize.DATE,
    allowNull: true,
  });

  await queryInterface.addColumn('booking', 'pickup_otp_locked_until', {
    type: Sequelize.DATE,
    allowNull: true,
  });

  await queryInterface.addColumn('booking', 'delivery_otp_locked_until', {
    type: Sequelize.DATE,
    allowNull: true,
  });

  console.log('✅ Added OTP tracking fields to booking table');
}

export async function down(queryInterface) {
  await queryInterface.removeColumn('booking', 'pickup_otp_generated_at');
  await queryInterface.removeColumn('booking', 'pickup_otp_attempts');
  await queryInterface.removeColumn('booking', 'pickup_verified_at');
  await queryInterface.removeColumn('booking', 'delivery_otp_generated_at');
  await queryInterface.removeColumn('booking', 'delivery_otp_attempts');
  await queryInterface.removeColumn('booking', 'delivered_at');
  await queryInterface.removeColumn('booking', 'pickup_otp_locked_until');
  await queryInterface.removeColumn('booking', 'delivery_otp_locked_until');

  console.log('✅ Removed OTP tracking fields from booking table');
}
