import User from './src/modules/user/user.model.js';
import sequelize from './src/config/database.config.js';

async function testUsers() {
  try {
    console.log('🔍 Testing Users\n');
    
    // Get all users
    const users = await User.findAll({
      attributes: ['id', 'name', 'email', 'phone_number']
    });
    
    console.log('📋 Total users:', users.length);
    
    users.forEach((user, index) => {
      console.log(`\n--- User ${index + 1} ---`);
      console.log('ID:', user.id);
      console.log('Name:', user.name);
      console.log('Email:', user.email);
      console.log('Phone:', user.phone_number);
    });
    
    // Check if Ajinkya exists
    const ajinkyaUsers = users.filter(u => u.name && u.name.toLowerCase().includes('ajinkya'));
    console.log('\n📋 Users with "Ajinkya" in name:', ajinkyaUsers.length);
    ajinkyaUsers.forEach(u => {
      console.log(`- ${u.name} (${u.id})`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await sequelize.close();
  }
}

testUsers();