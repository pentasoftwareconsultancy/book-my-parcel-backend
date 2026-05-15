import Booking from './src/modules/booking/booking.model.js';
import Parcel from './src/modules/parcel/parcel.model.js';
import Address from './src/modules/parcel/address.model.js';
import sequelize from './src/config/database.config.js';
import './src/modules/associations.js';

async function testBookings() {
  try {
    console.log('🔍 Testing Bookings\n');
    
    // Get all bookings with related data
    const bookings = await Booking.findAll({
      include: [
        {
          model: Parcel,
          as: 'parcel',
          include: [
            {
              model: Address,
              as: 'pickupAddress',
              attributes: ['city']
            },
            {
              model: Address,
              as: 'deliveryAddress',
              attributes: ['city']
            }
          ]
        }
      ],
      order: [['createdAt', 'DESC']]
    });
    
    console.log('📋 Total bookings:', bookings.length);
    
    bookings.forEach((booking, index) => {
      console.log(`\n--- Booking ${index + 1} ---`);
      console.log('ID:', booking.id);
      console.log('Status:', booking.status);
      console.log('Traveller ID:', booking.traveller_id);
      console.log('Created:', booking.createdAt);
      if (booking.parcel) {
        console.log('Parcel pickup:', booking.parcel.pickupAddress?.city);
        console.log('Parcel delivery:', booking.parcel.deliveryAddress?.city);
      }
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await sequelize.close();
  }
}

testBookings();