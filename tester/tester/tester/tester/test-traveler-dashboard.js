import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const BASE_URL = 'http://localhost:3000/api';

// Test traveler login and dashboard endpoint
async function testTravelerDashboard() {
  try {
    console.log('🔍 Testing Traveler Dashboard Endpoint\n');
    
    // First, let's login as a traveler
    const loginData = {
      email: 'traveler@example.com',
      password: 'password123'
    };
    
    console.log('1. Attempting traveler login...');
    let token = '';
    
    try {
      const loginResponse = await axios.post(`${BASE_URL}/auth/login`, loginData);
      token = loginResponse.data.token;
      console.log('✅ Login successful');
      console.log('📋 Token:', token.substring(0, 20) + '...');
    } catch (loginError) {
      console.log('❌ Login failed:', loginError.response?.data?.message || loginError.message);
      console.log('💡 Trying with different credentials...');
      
      // Try with admin credentials since we know they exist
      const adminLoginData = {
        email: 'admin@bmp.com',
        password: 'admin123'
      };
      
      try {
        const adminLoginResponse = await axios.post(`${BASE_URL}/auth/login`, adminLoginData);
        token = adminLoginResponse.data.token;
        console.log('✅ Admin login successful');
        console.log('📋 Token:', token.substring(0, 20) + '...');
      } catch (adminError) {
        console.log('❌ Admin login also failed:', adminError.response?.data?.message || adminError.message);
        return;
      }
    }
    
    // Test the traveler dashboard deliveries endpoint
    console.log('\n2. Testing traveler dashboard deliveries endpoint...');
    try {
      const config = {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      };
      
      const response = await axios.get(`${BASE_URL}/traveller/dashboard/deliveries?page=1&limit=5`, config);
      console.log('✅ Dashboard deliveries endpoint working');
      console.log('📋 Response status:', response.status);
      console.log('📋 Deliveries count:', response.data.deliveries?.length || 0);
      console.log('📋 Success:', response.data.success);
      
      if (response.data.deliveries && response.data.deliveries.length > 0) {
        console.log('\n📋 Sample delivery data:');
        console.log(JSON.stringify(response.data.deliveries[0], null, 2));
      } else {
        console.log('📋 No deliveries found for this traveler');
      }
      
    } catch (dashboardError) {
      console.log('❌ Dashboard endpoint failed:', dashboardError.response?.data || dashboardError.message);
      if (dashboardError.response?.data) {
        console.log('📋 Error details:', JSON.stringify(dashboardError.response.data, null, 2));
      }
    }
    
    // Test the stats endpoint
    console.log('\n3. Testing traveler dashboard stats endpoint...');
    try {
      const config = {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      };
      
      const response = await axios.get(`${BASE_URL}/traveller/dashboard/stats`, config);
      console.log('✅ Dashboard stats endpoint working');
      console.log('📋 Response status:', response.status);
      console.log('📋 Stats:', JSON.stringify(response.data.stats, null, 2));
      
    } catch (statsError) {
      console.log('❌ Stats endpoint failed:', statsError.response?.data || statsError.message);
    }
    
  } catch (error) {
    console.log('❌ General error:', error.message);
  }
}

// Run the test
testTravelerDashboard();