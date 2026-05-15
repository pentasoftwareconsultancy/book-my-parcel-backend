/**
 * Migration: Add payment_mode to bookings
 * Date: 2026-04-09
 */

export const up = async (queryInterface, Sequelize) => {
  try {
    // Check if column already exists
    const tableDescription = await queryInterface.describeTable('booking');
    
    if (!tableDescription.payment_mode) {
      await queryInterface.addColumn('booking', 'payment_mode', {
        type: Sequelize.ENUM('PAY_NOW', 'PAY_AFTER_DELIVERY'),
        defaultValue: 'PAY_AFTER_DELIVERY',
        allowNull: false,
        comment: 'Whether payment is done upfront or after delivery'
      });
      console.log('✅ Added payment_mode column to booking table');
    } else {
      console.log('⚠️ payment_mode column already exists in booking table');
    }
  } catch (error) {
    console.error('❌ Error in migration up:', error.message);
    throw error;
  }
};

export const down = async (queryInterface, Sequelize) => {
  try {
    await queryInterface.removeColumn('booking', 'payment_mode');
    console.log('✅ Removed payment_mode column from booking table');
  } catch (error) {
    console.error('❌ Error in migration down:', error.message);
    throw error;
  }
};
