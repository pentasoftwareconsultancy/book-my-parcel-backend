import sequelize from './src/config/database.config.js';

async function getValidUserId() {
  try {
    const users = await sequelize.query('SELECT id, name, email FROM users LIMIT 1');
    if (users[0] && users[0].length > 0) {
      const user = users[0][0];
      console.log('Valid user ID:', user.id);
      console.log('User name:', user.name);
      console.log('User email:', user.email);
      return user.id;
    } else {
      console.log('No users found in database');
      return null;
    }
  } catch (error) {
    console.log('Error getting user ID:', error.message);
    return null;
  }
}

getValidUserId().then(() => {
  sequelize.close();
});