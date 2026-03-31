export const up = async (queryInterface, Sequelize) => {
  // Add PARTNER_SELECTED status to parcels status enum
  await queryInterface.sequelize.query(`
    ALTER TYPE "enum_parcel_status" 
    ADD VALUE IF NOT EXISTS 'PARTNER_SELECTED' AFTER 'MATCHING';
  `);
};

export const down = async (queryInterface, Sequelize) => {
  // Note: PostgreSQL doesn't support removing enum values directly
  // This would require recreating the enum type, which is complex
  // For now, we'll leave the enum value in place
  console.log('Rollback: PARTNER_SELECTED status will remain in enum (PostgreSQL limitation)');
};