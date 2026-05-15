import { Booking, Parcel, Address, User } from './src/modules/associations.js';
import sequelize from './src/config/database.config.js';

async function debugQuery() {
  try {
    console.log('🔍 Debugging Booking Query\n');
    
    // Test a simple query first
    const simpleCount = await Booking.count();
    console.log('Total bookings:', simpleCount);
    
    // Test the specific query that's failing
    console.log('\nTesting the exact query from controller...');
    
    const travelerId = 'some-test-id'; // Use a dummy ID for testing
    
    try {
      const result = await Booking.findAndCountAll({
        where: { traveller_id: travelerId },
        include: [
          {
            model: Parcel,
            as: 'parcel',
            include: [
              {
                model: Address,
                as: 'pickupAddress',
                attributes: ['city', 'address_line1', 'address_line2', 'state']
              },
              {
                model: Address,
                as: 'deliveryAddress', 
                attributes: ['city', 'address_line1', 'address_line2', 'state']
              }
            ]
          },
          {
            model: User,
            as: 'traveller',
            attributes: ['name', 'phone_number'],
            required: false
          }
        ],
        order: [['createdAt', 'DESC']],
        limit: 10,
        offset: 0
      });
      
      console.log('✅ Query executed successfully');
      console.log('Count:', result.count);
      console.log('Rows:', result.rows.length);
      
    } catch (queryError) {
      console.log('❌ Query failed:', queryError.message);
      console.log('Error details:', queryError);
    }
    
  } catch (error) {
    console.log('❌ General error:', error.message);
  } finally {
    await sequelize.close();
  }
}

debugQuery();