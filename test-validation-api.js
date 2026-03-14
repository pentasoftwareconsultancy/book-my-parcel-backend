import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

console.log('\n🔍 DIAGNOSING ADDRESS VALIDATION API\n');
console.log('='.repeat(70));

const VALIDATION_KEY = process.env.GOOGLE_ADDRESS_VALIDATION_API_KEY;
const MAIN_KEY = process.env.GOOGLE_API_KEY;

console.log('\n📋 API Keys:');
console.log(`   Main Key: ${MAIN_KEY?.substring(0, 20)}...`);
console.log(`   Validation Key: ${VALIDATION_KEY?.substring(0, 20)}...`);

// Test 1: Check if Address Validation API is enabled
async function testValidationAPIEnabled() {
  console.log('\n1️⃣  Testing if Address Validation API is enabled...');
  
  const url = `https://addressvalidation.googleapis.com/v1:validateAddress?key=${VALIDATION_KEY}`;
  
  // Correct payload format
  const payload = {
    address: {
      regionCode: 'US',
      addressLines: ['1600 Amphitheatre Parkway, Mountain View, CA']
    }
  };

  try {
    const response = await axios.post(url, payload);
    console.log('   ✅ API is enabled and working');
    console.log('   📊 Response status:', response.status);
    return true;
  } catch (error) {
    console.log('   ❌ API call failed');
    console.log('   📊 Status:', error.response?.status);
    console.log('   📊 Status Text:', error.response?.statusText);
    
    if (error.response?.data) {
      console.log('   📊 Error Details:', JSON.stringify(error.response.data, null, 2));
    }
    
    if (error.response?.status === 400) {
      console.log('\n   💡 Possible causes:');
      console.log('      1. Address Validation API not enabled for this key');
      console.log('      2. API key restrictions blocking the request');
      console.log('      3. Invalid request format');
    }
    
    return false;
  }
}

// Test 2: Try with main API key
async function testWithMainKey() {
  console.log('\n2️⃣  Testing with main API key...');
  
  const url = `https://addressvalidation.googleapis.com/v1:validateAddress?key=${MAIN_KEY}`;
  
  // Correct payload format
  const payload = {
    address: {
      regionCode: 'US',
      addressLines: ['1600 Amphitheatre Parkway, Mountain View, CA']
    }
  };

  try {
    const response = await axios.post(url, payload);
    console.log('   ✅ Main key works for validation');
    console.log('   📊 Response status:', response.status);
    return true;
  } catch (error) {
    console.log('   ❌ Main key also fails');
    console.log('   📊 Status:', error.response?.status);
    
    if (error.response?.status === 400) {
      console.log('   💡 Address Validation API not enabled for main key either');
    }
    
    return false;
  }
}

// Test 3: Check API key restrictions
async function checkAPIRestrictions() {
  console.log('\n3️⃣  Checking API restrictions...');
  
  console.log('\n   📋 Steps to enable Address Validation API:');
  console.log('      1. Go to: https://console.cloud.google.com/apis/library');
  console.log('      2. Search for "Address Validation API"');
  console.log('      3. Click on it and press "ENABLE"');
  console.log('      4. Go to Credentials and check API restrictions');
  console.log('      5. Ensure "Address Validation API" is in the allowed list');
}

// Test 4: Alternative - Use Geocoding for validation
async function testGeocodingAlternative() {
  console.log('\n4️⃣  Testing Geocoding API as alternative...');
  
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent('123 Andheri West, Mumbai, Maharashtra 400058')}&region=IN&key=${MAIN_KEY}`;
  
  try {
    const response = await axios.get(url);
    
    if (response.data.status === 'OK') {
      const result = response.data.results[0];
      const locationType = result.geometry?.location_type;
      
      console.log('   ✅ Geocoding works as validation alternative');
      console.log('   📊 Location Type:', locationType);
      console.log('   📊 Formatted Address:', result.formatted_address);
      
      // Map location_type to validation status
      let validationStatus = 'INFERRED';
      if (locationType === 'ROOFTOP') {
        validationStatus = 'VALID';
      } else if (locationType === 'RANGE_INTERPOLATED') {
        validationStatus = 'PARTIAL';
      }
      
      console.log('   📊 Mapped Validation Status:', validationStatus);
      console.log('\n   💡 You can use Geocoding location_type as validation alternative:');
      console.log('      ROOFTOP → VALID');
      console.log('      RANGE_INTERPOLATED → PARTIAL');
      console.log('      GEOMETRIC_CENTER → INFERRED');
      console.log('      APPROXIMATE → INFERRED');
      
      return true;
    }
  } catch (error) {
    console.log('   ❌ Geocoding failed:', error.message);
    return false;
  }
}

// Main diagnostic flow
async function runDiagnostics() {
  try {
    const validationWorks = await testValidationAPIEnabled();
    
    if (!validationWorks) {
      await testWithMainKey();
      await checkAPIRestrictions();
      await testGeocodingAlternative();
    }
    
    console.log('\n' + '='.repeat(70));
    console.log('\n📊 DIAGNOSTIC SUMMARY\n');
    
    if (validationWorks) {
      console.log('✅ Address Validation API is working correctly');
      console.log('   Your validation key is properly configured\n');
    } else {
      console.log('❌ Address Validation API is not working');
      console.log('\n🔧 RECOMMENDED ACTIONS:\n');
      console.log('Option 1: Enable Address Validation API');
      console.log('   1. Visit: https://console.cloud.google.com/apis/library');
      console.log('   2. Search: "Address Validation API"');
      console.log('   3. Click ENABLE for your project');
      console.log('   4. Update API key restrictions to include it');
      console.log('');
      console.log('Option 2: Use Geocoding location_type instead');
      console.log('   - Already working with your main API key');
      console.log('   - Provides similar validation information');
      console.log('   - No additional API needed');
      console.log('   - See code example in parcel.service.js');
      console.log('');
      console.log('Option 3: Skip validation (current behavior)');
      console.log('   - System works without validation');
      console.log('   - validation_status field remains NULL');
      console.log('   - All other features work normally\n');
    }
    
  } catch (error) {
    console.error('\n❌ Diagnostic failed:', error.message);
  }
}

runDiagnostics();
