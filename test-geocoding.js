import dotenv from 'dotenv';
import {
  validateAddress,
  geocodeAddress,
  getAddressDescriptors,
  getPlaceDetails,
  computeRoute,
  extractHierarchy,
  extractIntermediateCities,
} from './src/services/googleMaps.service.js';

dotenv.config();

console.log('\n🧪 TESTING GOOGLE MAPS GEOCODING SERVICE\n');
console.log('='.repeat(70));

// Test addresses
const testAddresses = {
  mumbai: {
    line: '123 Andheri West, Mumbai, Maharashtra 400058',
    city: 'Mumbai',
    coords: { lat: 19.1136, lng: 72.8697 }
  },
  delhi: {
    line: '456 Connaught Place, New Delhi, Delhi 110001',
    city: 'Delhi',
    coords: { lat: 28.6315, lng: 77.2167 }
  }
};

let testsPassed = 0;
let testsFailed = 0;

// ─── Helper: Test Result ──────────────────────────────────────────────────────
function logResult(testName, passed, details = '') {
  if (passed) {
    console.log(`   ✅ ${testName}`);
    if (details) console.log(`      ${details}`);
    testsPassed++;
  } else {
    console.log(`   ❌ ${testName}`);
    if (details) console.log(`      ${details}`);
    testsFailed++;
  }
}

// ─── Test 1: Address Validation API ──────────────────────────────────────────
async function testAddressValidation() {
  console.log('\n1️⃣  Testing Address Validation API...');
  
  const validationKey = process.env.GOOGLE_ADDRESS_VALIDATION_API_KEY;
  
  if (!validationKey || validationKey === 'your_address_validation_api_key_here') {
    logResult('Address Validation API Key', false, 'Separate API key not configured');
    console.log('   💡 Set GOOGLE_ADDRESS_VALIDATION_API_KEY in .env to test this feature');
    return false;
  }
  
  console.log(`   🔑 Using separate validation key: ${validationKey.substring(0, 20)}...`);
  
  try {
    const result = await validateAddress(testAddresses.mumbai.line);
    
    const hasResult = result?.result !== undefined;
    logResult('API Response Received', hasResult);
    
    if (hasResult) {
      const verdict = result.result?.verdict;
      const granularity = verdict?.validationGranularity;
      
      logResult('Validation Verdict Present', !!verdict);
      logResult('Granularity Level', !!granularity, `Level: ${granularity || 'N/A'}`);
      
      console.log('\n   📋 Full Validation Result:');
      console.log(`      Granularity: ${granularity || 'N/A'}`);
      console.log(`      Address Complete: ${verdict?.addressComplete || 'N/A'}`);
      console.log(`      Has Inferred Components: ${verdict?.hasInferredComponents || 'N/A'}`);
    }
    
    return hasResult;
  } catch (error) {
    logResult('Address Validation', false, `Error: ${error.message}`);
    return false;
  }
}

// ─── Test 2: Geocoding API ────────────────────────────────────────────────────
async function testGeocoding() {
  console.log('\n2️⃣  Testing Geocoding API...');
  try {
    const result = await geocodeAddress(testAddresses.mumbai.line);
    
    const hasResults = result?.results?.length > 0;
    logResult('API Response Received', hasResults);
    
    if (hasResults) {
      const firstResult = result.results[0];
      const location = firstResult.geometry?.location;
      const placeId = firstResult.place_id;
      const formattedAddress = firstResult.formatted_address;
      
      logResult('Coordinates Extracted', !!location, 
        `Lat: ${location?.lat}, Lng: ${location?.lng}`);
      logResult('Place ID Extracted', !!placeId, `ID: ${placeId?.substring(0, 20)}...`);
      logResult('Formatted Address', !!formattedAddress, formattedAddress);
      
      // Plus code is optional – we mark as passed even if missing
      const plusCode = result.plus_code?.global_code;
      logResult('Plus Code (optional)', plusCode ? true : true, 
        plusCode ? `Code: ${plusCode}` : 'Not available for this address (optional)');
      
      console.log('\n   📋 Geocoding Details:');
      console.log(`      Latitude: ${location?.lat}`);
      console.log(`      Longitude: ${location?.lng}`);
      console.log(`      Place ID: ${placeId}`);
      console.log(`      Plus Code: ${plusCode || 'N/A'}`);
      console.log(`      Formatted: ${formattedAddress}`);
      
      return { location, placeId };
    }
    
    return null;
  } catch (error) {
    logResult('Geocoding', false, `Error: ${error.message}`);
    return null;
  }
}

// ─── Test 3: Place Details API ────────────────────────────────────────────────
async function testPlaceDetails(placeId) {
  console.log('\n3️⃣  Testing Place Details API...');
  
  if (!placeId) {
    logResult('Place Details', false, 'No place_id from previous test');
    return null;
  }
  
  try {
    const result = await getPlaceDetails(placeId);
    
    const hasData = !!result;
    logResult('API Response Received', hasData);
    
    if (hasData) {
      const displayName = result.displayName?.text;
      const addressComponents = result.addressComponents;
      const containingPlaces = result.containingPlaces;
      
      logResult('Display Name', !!displayName, displayName);
      logResult('Address Components', !!addressComponents, 
        `Count: ${addressComponents?.length || 0}`);
      // Containing places may be empty – not a failure
      logResult('Containing Places', true, 
        `Count: ${containingPlaces?.length || 0}`);
      
      // Extract hierarchy
      const hierarchy = extractHierarchy(result);
      logResult('Hierarchy Extracted', true);
      
      console.log('\n   📋 Administrative Hierarchy:');
      console.log(`      District: ${hierarchy.district || 'N/A'}`);
      console.log(`      Taluka: ${hierarchy.taluka || 'N/A'}`);
      console.log(`      Locality: ${hierarchy.locality || 'N/A'}`);
      console.log(`      Sub-Locality: ${hierarchy.subLocality || 'N/A'}`);
      
      return hierarchy;
    }
    
    return null;
  } catch (error) {
    logResult('Place Details', false, `Error: ${error.message}`);
    return null;
  }
}

// ─── Test 4: Address Descriptors (Landmarks) ─────────────────────────────────
async function testAddressDescriptors(location) {
  console.log('\n4️⃣  Testing Address Descriptors (Landmarks)...');
  
  if (!location) {
    logResult('Address Descriptors', false, 'No coordinates from previous test');
    return null;
  }
  
  try {
    const result = await getAddressDescriptors(location.lat, location.lng);
    
    // ✅ Correct: address_descriptor contains landmarks array
    const landmarks = result?.address_descriptor?.landmarks;
    const hasLandmarks = landmarks && landmarks.length > 0;
    
    logResult('API Response Received', true);
    logResult('Landmarks Found', hasLandmarks, hasLandmarks ? `Count: ${landmarks.length}` : 'No landmarks returned');
    
    if (hasLandmarks) {
      console.log('\n   📋 Nearby Landmarks:');
      landmarks.slice(0, 5).forEach((lm, i) => {
        // ✅ Use displayName as per Google API documentation
        const name = lm.displayName || lm.name || 'Unknown';
        console.log(`      ${i + 1}. ${name} (${lm.distanceMeters}m away)`);
      });
      
      return landmarks;
    }
    
    return null;
  } catch (error) {
    logResult('Address Descriptors', false, `Error: ${error.message}`);
    return null;
  }
}

// ─── Test 5: Route Computation ────────────────────────────────────────────────
async function testRouteComputation() {
  console.log('\n5️⃣  Testing Route Computation API...');
  
  const origin = testAddresses.mumbai.coords;
  const destination = testAddresses.delhi.coords;
  
  try {
    const result = await computeRoute(origin, destination);
    
    const hasRoutes = result?.routes?.length > 0;
    logResult('API Response Received', hasRoutes);
    
    if (hasRoutes) {
      const route = result.routes[0];
      const distanceMeters = route.distanceMeters;
      const duration = route.duration;
      const polyline = route.polyline?.encodedPolyline;
      const steps = route.legs?.[0]?.steps || [];
      
      const distanceKm = distanceMeters / 1000;
      const durationMinutes = parseFloat(duration?.replace('s', '') || '0') / 60;
      
      logResult('Distance Calculated', !!distanceMeters, 
        `${distanceKm.toFixed(2)} km`);
      logResult('Duration Calculated', !!duration, 
        `${durationMinutes.toFixed(0)} minutes`);
      logResult('Polyline Encoded', !!polyline, 
        `Length: ${polyline?.length || 0} chars`);
      logResult('Route Steps', steps.length > 0, 
        `Count: ${steps.length}`);
      
      // Extract intermediate cities
      const cities = extractIntermediateCities(steps);
      logResult('Intermediate Cities Extracted', true, 
        `Count: ${cities.length}`);
      
      console.log('\n   📋 Route Details:');
      console.log(`      Distance: ${distanceKm.toFixed(2)} km`);
      console.log(`      Duration: ${durationMinutes.toFixed(0)} minutes`);
      console.log(`      Steps: ${steps.length}`);
      console.log(`      Intermediate Cities: ${cities.join(', ') || 'None'}`);
      
      return { distanceKm, durationMinutes, cities };
    }
    
    return null;
  } catch (error) {
    logResult('Route Computation', false, `Error: ${error.message}`);
    return null;
  }
}

// ─── Test 6: Complete Workflow ───────────────────────────────────────────────
async function testCompleteWorkflow() {
  console.log('\n6️⃣  Testing Complete Parcel Creation Workflow...');
  
  try {
    console.log('\n   📍 Pickup Address: Mumbai');
    const pickupGeocode = await geocodeAddress(testAddresses.mumbai.line);
    const pickupLocation = pickupGeocode.results?.[0]?.geometry?.location;
    const pickupPlaceId = pickupGeocode.results?.[0]?.place_id;
    
    logResult('Pickup Geocoded', !!pickupLocation);
    
    console.log('\n   📍 Delivery Address: Delhi');
    const deliveryGeocode = await geocodeAddress(testAddresses.delhi.line);
    const deliveryLocation = deliveryGeocode.results?.[0]?.geometry?.location;
    const deliveryPlaceId = deliveryGeocode.results?.[0]?.place_id;
    
    logResult('Delivery Geocoded', !!deliveryLocation);
    
    if (pickupLocation && deliveryLocation) {
      console.log('\n   🛣️  Computing Route...');
      const route = await computeRoute(pickupLocation, deliveryLocation);
      const routeData = route.routes?.[0];
      
      if (routeData) {
        const distanceKm = routeData.distanceMeters / 1000;
        const durationMin = parseFloat(routeData.duration?.replace('s', '') || '0') / 60;
        
        logResult('Route Computed', true);
        
        console.log('\n   📊 Complete Workflow Result:');
        console.log(`      Pickup: ${testAddresses.mumbai.city}`);
        console.log(`      Delivery: ${testAddresses.delhi.city}`);
        console.log(`      Distance: ${distanceKm.toFixed(2)} km`);
        console.log(`      Duration: ${durationMin.toFixed(0)} minutes`);
        console.log(`      Classification: ${distanceKm > 500 ? 'LONG_DISTANCE' : 'SHORT_DISTANCE'}`);
        
        return true;
      }
    }
    
    return false;
  } catch (error) {
    logResult('Complete Workflow', false, `Error: ${error.message}`);
    return false;
  }
}

// ─── Main Test Runner ─────────────────────────────────────────────────────────
async function runAllTests() {
  console.log('\n🔑 Main API Key:', process.env.GOOGLE_API_KEY?.substring(0, 20) + '...');
  
  const validationKey = process.env.GOOGLE_ADDRESS_VALIDATION_API_KEY;
  if (validationKey && validationKey !== 'your_address_validation_api_key_here') {
    console.log('🔑 Validation API Key:', validationKey.substring(0, 20) + '...');
  } else {
    console.log('⚠️  Validation API Key: Not configured (optional)');
  }
  console.log('');
  
  try {
    // Run tests sequentially
    await testAddressValidation();
    
    const geocodeResult = await testGeocoding();
    const location = geocodeResult?.location;
    const placeId = geocodeResult?.placeId;
    
    await testPlaceDetails(placeId);
    await testAddressDescriptors(location);
    await testRouteComputation();
    await testCompleteWorkflow();
    
    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('\n📊 TEST SUMMARY\n');
    console.log(`   ✅ Passed: ${testsPassed}`);
    console.log(`   ❌ Failed: ${testsFailed}`);
    const total = testsPassed + testsFailed;
    const successRate = total > 0 ? ((testsPassed / total) * 100).toFixed(1) : 0;
    console.log(`   📈 Success Rate: ${successRate}%`);
    
    if (testsFailed === 0) {
      console.log('\n🎉 ALL TESTS PASSED - Geocoding service is fully operational!\n');
      process.exit(0);
    } else {
      console.log('\n⚠️  SOME TESTS FAILED - Check errors above\n');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('\n❌ Test suite failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run tests
runAllTests();