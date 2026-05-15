// Simple database test using existing backend modules
import User from './src/modules/user/user.model.js';
import TravellerKYC from './src/modules/traveller/travellerKYC.model.js';
import Role from './src/modules/user/role.model.js';
import UserRole from './src/modules/user/userRole.model.js';
import sequelize from './src/config/database.config.js';
import { QueryTypes } from 'sequelize';

async function testDatabase() {
  try {
    console.log('🚀 Testing Database Tables\n');
    
    // Test users table
    const userCount = await User.count();
    console.log('📋 Users count:', userCount);
    
    // Test traveller_kyc table
    const kycCount = await TravellerKYC.count();
    console.log('📋 Traveller KYC count:', kycCount);
    
    if (kycCount > 0) {
      const kycData = await TravellerKYC.findAll({ limit: 3 });
      console.log('📋 Sample KYC data:');
      kycData.forEach(kyc => {
        console.log(`  - ID: ${kyc.id}, User ID: ${kyc.user_id}, Status: ${kyc.status}`);
      });
    }
    
    // Test roles table
    const roles = await Role.findAll();
    console.log('📋 Roles:', roles.map(r => r.name));
    
    // Test user_roles table
    const userRolesCount = await UserRole.count();
    console.log('📋 User roles count:', userRolesCount);
    
    // Test the join query that's used in admin service
    console.log('\n📋 Testing admin service query...');
    try {
      const result = await sequelize.query(
        `
        SELECT 
          u.id AS user_id,
          u.name,
          u.email,
          u.phone_number,
          u.city,
          u.state,
          u."createdAt" AS user_created_at,
          kyc.id AS kyc_id,
          kyc.status AS kyc_status,
          kyc.aadhar_front,
          kyc.aadhar_back,
          kyc.pan_front,
          kyc.pan_back,
          kyc.driving_photo,
          kyc.selfie,
          kyc."createdAt" AS kyc_created_at,
          kyc."updatedAt" AS kyc_updated_at
        FROM users u
        JOIN traveller_kyc kyc ON u.id = kyc.user_id
        ORDER BY kyc."createdAt" DESC
        LIMIT 5
        `,
        { type: QueryTypes.SELECT }
      );
      console.log('✅ Admin service query successful');
      console.log('📋 Results count:', result.length);
      if (result.length > 0) {
        console.log('📋 First result:', result[0]);
      }
    } catch (error) {
      console.log('❌ Admin service query failed:', error.message);
    }
    
  } catch (error) {
    console.error('💥 Database test failed:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await sequelize.close();
  }
}

// Run the test
testDatabase();