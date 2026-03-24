export async function up(queryInterface, Sequelize) {
  // Add INTERESTED status to parcel_requests status enum
  await queryInterface.sequelize.query(`
    ALTER TYPE "enum_parcel_requests_status" 
    ADD VALUE IF NOT EXISTS 'INTERESTED' AFTER 'SENT';
  `);
}

export async function down(queryInterface, Sequelize) {
  // Note: PostgreSQL doesn't support removing enum values directly
  // This would require recreating the enum type and updating all references
  console.log('Rollback not supported for enum value removal in PostgreSQL');
}