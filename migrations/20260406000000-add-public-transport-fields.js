export const up = async (queryInterface, Sequelize) => {
  try {
    // Create enum type for transport_mode if it doesn't exist
    await queryInterface.sequelize.query(`
      CREATE TYPE "enum_traveller_routes_transport_mode" AS ENUM ('private', 'bus', 'train');
    `).catch((err) => {
      // Ignore if type already exists
      if (err.message.includes('already exists')) {
        console.log('[Migration] transport_mode enum already exists');
      } else {
        throw err;
      }
    });

    // Add transport_mode column
    await queryInterface.addColumn('traveller_routes', 'transport_mode', {
      type: Sequelize.ENUM('private', 'bus', 'train'),
      allowNull: false,
      defaultValue: 'private',
    });
    console.log('✅ Added transport_mode column to traveller_routes');

    // Add stops_passed column
    await queryInterface.addColumn('traveller_routes', 'stops_passed', {
      type: Sequelize.JSONB,
      allowNull: true,
    });
    console.log('✅ Added stops_passed column to traveller_routes');

  } catch (error) {
    console.error('[Migration] Error during up:', error.message);
    throw error;
  }
};

export const down = async (queryInterface, Sequelize) => {
  try {
    // Remove stops_passed column
    await queryInterface.removeColumn('traveller_routes', 'stops_passed');
    console.log('✅ Removed stops_passed column');

    // Remove transport_mode column
    await queryInterface.removeColumn('traveller_routes', 'transport_mode');
    console.log('✅ Removed transport_mode column');

    // Drop the enum type
    await queryInterface.sequelize.query(`
      DROP TYPE IF EXISTS "enum_traveller_routes_transport_mode" CASCADE;
    `);
    console.log('✅ Dropped transport_mode enum type');

  } catch (error) {
    console.error('[Migration] Error during down:', error.message);
    throw error;
  }
};
