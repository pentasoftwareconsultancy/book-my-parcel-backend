import { getTravelerDeliveries } from './src/modules/traveller/traveller.controller.js';
import { Booking, Parcel, Address, User } from './src/modules/associations.js';

// Mock request and response objects
const mockReq = {
  user: {
    id: '5ade048f-7a4a-43c0-80af-6933186db4cc'  // Valid user ID from database
  },
  query: {
    page: 1,
    limit: 10
  }
};

const mockRes = {
  json: function(data) {
    console.log('Response data:', JSON.stringify(data, null, 2));
    return this;
  },
  status: function(code) {
    console.log('Status code:', code);
    return this;
  }
};

const mockNext = function(err) {
  console.log('Error in middleware:', err);
};

async function testController() {
  try {
    console.log('🔍 Testing Traveler Deliveries Controller\n');
    
    // Test the controller function directly
    await getTravelerDeliveries(mockReq, mockRes, mockNext);
    
  } catch (error) {
    console.log('❌ Controller test failed:', error.message);
    console.log('Error stack:', error.stack);
  }
}

testController();