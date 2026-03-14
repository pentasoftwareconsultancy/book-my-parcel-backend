import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const BASE_URL = 'http://localhost:3000';

console.log('\n🧪 SIMPLE GEOCODING TEST\n');

// Test parcel data
const parcelData = {
  package_size: "medium",
  delivery_speed: "standard",
  weight: 2.5,
  description: "Test parcel",
  parcel_type: "Electronics",
  pickup_address: {
    name: "Sender",
    address: "Gateway of India",
    city: "Mumbai",
    state: "Maharashtra",
    pincode: "400001",
    country: "India",
    phone: "+919876543210"
  },
  delivery_address: {
    name: "Receiver",
    address: "India Gate",
    city: "New Delhi",
    state: "Delhi",
    pincode: "110001",
    country: "India",
    phone: "+919876543211"
  }
};

async function testWithToken(token) {
  console.log('📦 Creating parcel...\n');
  
  try {
    const response = await axios.post(
      `${BASE_URL}/api/parcel/request`,
      parcelData,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    console.log('✅ SUCCESS!\n');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    
    const pickup = response.data.data.pickupAddress;
    const delivery = response.data.data.deliveryAddress;
    const parcel = response.data.data.parcel;
    
    console.log('\n📍 PICKUP ADDRESS:');
    console.log(`   Place ID: ${pickup.place_id || '❌ NOT GEOCODED'}`);
    console.log(`   Coordinates: ${pickup.latitude}, ${pickup.longitude}`);
    console.log(`   Validation: ${pickup.validation_status || 'N/A'}`);
    
    console.log('\n📍 DELIVERY ADDRESS:');
    console.log(`   Place ID: ${delivery.place_id || '❌ NOT GEOCODED'}`);
    console.log(`   Coordinates: ${delivery.latitude}, ${delivery.longitude}`);
    console.log(`   Validation: ${delivery.validation_status || 'N/A'}`);
    
    console.log('\n🚗 ROUTE DATA:');
    console.log(`   Distance: ${parcel.route_distance_km || 'N/A'} km`);
    console.log(`   Duration: ${parcel.route_duration_minutes || 'N/A'} min`);
    
    if (pickup.place_id && delivery.place_id && parcel.route_distance_km) {
      console.log('\n🎉 GEOCODING FULLY WORKING!\n');
    } else {
      console.log('\n⚠️  GEOCODING PARTIALLY WORKING\n');
    }
    
  } catch (error) {
    console.error('❌ ERROR:', error.response?.data || error.message);
  }
}

// Get token from command line or prompt user
const token = process.argv[2];

if (!token) {
  console.log('Usage: node test-geocoding-simple.js YOUR_AUTH_TOKEN');
  console.log('\nTo get a token:');
  console.log('1. Login via API or frontend');
  console.log('2. Copy the JWT token');
  console.log('3. Run: node test-geocoding-simple.js <token>\n');
  
  console.log('Or use this cURL command:\n');
  console.log('curl -X POST http://localhost:3000/api/parcel/request \\');
  console.log('  -H "Authorization: Bearer YOUR_TOKEN" \\');
  console.log('  -H "Content-Type: application/json" \\');
  console.log(`  -d '${JSON.stringify(parcelData)}'`);
  console.log('');
  process.exit(1);
}

testWithToken(token);
