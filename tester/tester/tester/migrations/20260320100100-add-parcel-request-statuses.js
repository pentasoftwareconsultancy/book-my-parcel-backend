export const up = async (queryInterface, Sequelize) => {
  // Add new enum values to parcel_requests status
  await queryInterface.sequelize.query(`
    ALTER TYPE "enum_parcel_requests_status" 
    ADD VALUE IF NOT EXISTS 'SELECTED';
  `);
  
  await queryInterface.sequelize.query(`
    ALTER TYPE "enum_parcel_requests_status" 
    ADD VALUE IF NOT EXISTS 'NOT_SELECTED';
  `);
};

export const down = async (queryInterface, Sequelize) => {
  // Note: PostgreSQL doesn't support removing enum values directly
  // This would require recreating the enum type and updating all references
  console.log('Rollback: Cannot remove enum values in PostgreSQL without recreating the type');
};