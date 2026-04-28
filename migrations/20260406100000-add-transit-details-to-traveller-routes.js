/**
 * Migration: Add transit_details column to traveller_routes
 * Date: 2026-04-06
 * 
 * Adds JSONB column to store bus/train specific details
 */

export const up = async (queryInterface, Sequelize) => {
  // Add transit_details column to traveller_routes table
  const transaction = await queryInterface.sequelize.transaction();
  
  try {
    await queryInterface.addColumn(
      'traveller_routes',
      'transit_details',
      {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Stores bus/train specific details: service name, bus number, train number, class type, PNR, seat numbers, etc.',
      },
      { transaction }
    );

    await transaction.commit();
    console.log('✓ Added transit_details column to traveller_routes');
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

export const down = async (queryInterface, Sequelize) => {
  const transaction = await queryInterface.sequelize.transaction();
  
  try {
    await queryInterface.removeColumn(
      'traveller_routes',
      'transit_details',
      { transaction }
    );

    await transaction.commit();
    console.log('✓ Removed transit_details column from traveller_routes');
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};
