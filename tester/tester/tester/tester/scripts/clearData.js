/**
 * Script to clear all parcel, traveller routes, and bookings data
 * while keeping users and roles intact
 * 
 * Usage: node backend/scripts/clearData.js
 */

import 'dotenv/config.js';
import sequelize from '../src/config/database.config.js';

async function clearData() {
  try {
    console.log('🧹 Starting data cleanup...');
    console.log('================================================\n');

    // Start transaction for safety
    const transaction = await sequelize.transaction();

    try {
      // Disable foreign key constraints temporarily
      console.log('🔓 Temporarily disabling foreign key constraints...');
      await sequelize.query('SET session_replication_role = replica', { transaction });
      
      // Use TRUNCATE for faster and more reliable cleanup
      const tablesToClear = [
        'parcel_requests', 'parcel_acceptances', 'parcel_tracking', 'parcel_proofs',
        'booking_status_logs', 'booking', 'wallet_transactions', 'refunds', 
        'payments', 'wallets', 'parcel', 'route_places', 'traveller_routes',
        'traveller_trips', 'traveller_kyc', 'aadhaar_verifications', 
        'traveller_profiles', 'address', 'user_device_tokens'
      ];
      
      console.log('🗑️  Truncating all tables...');
      for (const table of tablesToClear) {
        try {
          await sequelize.query(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`, { transaction });
          console.log(`   ✓ Cleared ${table}`);
        } catch (error) {
          console.log(`   ⚠️  Skipped ${table}: ${error.message}`);
        }
      }
      
      // Re-enable foreign key constraints
      console.log('� Re-enabling foreign key constraints...');
      await sequelize.query('SET session_replication_role = DEFAULT', { transaction });
      
      // Reset sequences are handled by TRUNCATE RESTART IDENTITY
      console.log('🔄 Sequences reset automatically by TRUNCATE RESTART IDENTITY');

      // Commit transaction
      await transaction.commit();
      
      console.log('\n================================================');
      console.log('✅ Data cleanup completed successfully!');
      console.log('================================================');
      console.log('📊 Cleared data:');
      console.log('   • All parcels and related data');
      console.log('   • All traveller routes and trips');
      console.log('   • All bookings and payments');
      console.log('   • All addresses');
      console.log('   • User device tokens');
      console.log('\n🔒 Preserved data:');
      console.log('   • Users and user profiles');
      console.log('   • Roles and user roles');
      console.log('   • Admin accounts');
      console.log('\n✨ Database is ready for fresh data!');
      
    } catch (error) {
      // Rollback transaction on error
      await transaction.rollback();
      throw error;
    }

  } catch (error) {
    console.error('❌ Error during data cleanup:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  } finally {
    // Close database connection
    await sequelize.close();
    process.exit(0);
  }
}

// Run the cleanup
clearData();