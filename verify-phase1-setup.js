import sequelize from './src/config/database.config.js';
import Address from './src/modules/parcel/address.model.js';
import Parcel from './src/modules/parcel/parcel.model.js';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

console.log('\n🔍 PHASE 1 SETUP VERIFICATION\n');
console.log('='.repeat(60));

let hasErrors = false;

// ─── 1. Database Connection ───────────────────────────────────────────────────
async function checkDatabaseConnection() {
  console.log('\n1️⃣  Checking Database Connection...');
  try {
    await sequelize.authenticate();
    console.log('   ✅ Database connected successfully');
    return true;
  } catch (error) {
    console.error('   ❌ Database connection failed:', error.message);
    hasErrors = true;
    return false;
  }
}

// ─── 2. Verify Address Table Columns ──────────────────────────────────────────
async function checkAddressColumns() {
  console.log('\n2️⃣  Checking Address Table Columns...');
  try {
    const [results] = await sequelize.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'address'
      ORDER BY ordinal_position;
    `);

    const requiredColumns = [
      'place_id', 'latitude', 'longitude', 'plus_code', 'validation_status',
      'district', 'taluka', 'locality', 'landmarks', 'sub_localities',
      'formatted_address', 'last_geocoded_at', 'usage_count'
    ];

    const existingColumns = results.map(r => r.column_name);
    const missingColumns = requiredColumns.filter(col => !existingColumns.includes(col));

    if (missingColumns.length === 0) {
      console.log('   ✅ All new address columns exist');
      console.log('   📋 New columns:', requiredColumns.join(', '));
    } else {
      console.error('   ❌ Missing columns:', missingColumns.join(', '));
      console.log('   💡 Run: npm run db:migrate or restart server with alter: true');
      hasErrors = true;
    }

    return missingColumns.length === 0;
  } catch (error) {
    console.error('   ❌ Error checking address columns:', error.message);
    hasErrors = true;
    return false;
  }
}

// ─── 3. Verify Parcel Table Columns ───────────────────────────────────────────
async function checkParcelColumns() {
  console.log('\n3️⃣  Checking Parcel Table Columns...');
  try {
    const [results] = await sequelize.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'parcel'
      ORDER BY ordinal_position;
    `);

    const requiredColumns = [
      'route_distance_km', 'route_duration_minutes', 
      'intermediate_cities', 'route_geometry'
    ];

    const existingColumns = results.map(r => r.column_name);
    const missingColumns = requiredColumns.filter(col => !existingColumns.includes(col));

    if (missingColumns.length === 0) {
      console.log('   ✅ All new parcel columns exist');
      console.log('   📋 New columns:', requiredColumns.join(', '));
    } else {
      console.error('   ❌ Missing columns:', missingColumns.join(', '));
      console.log('   💡 Run: npm run db:migrate or restart server with alter: true');
      hasErrors = true;
    }

    return missingColumns.length === 0;
  } catch (error) {
    console.error('   ❌ Error checking parcel columns:', error.message);
    hasErrors = true;
    return false;
  }
}

// ─── 4. Check for Duplicate place_id Values ──────────────────────────────────
async function checkPlaceIdDuplicates() {
  console.log('\n4️⃣  Checking for place_id Duplicates...');
  try {
    const [results] = await sequelize.query(`
      SELECT place_id, COUNT(*) as count
      FROM address
      WHERE place_id IS NOT NULL
      GROUP BY place_id
      HAVING COUNT(*) > 1;
    `);

    if (results.length === 0) {
      console.log('   ✅ No duplicate place_id values found');
    } else {
      console.error(`   ❌ Found ${results.length} duplicate place_id values:`);
      results.forEach(r => {
        console.error(`      - ${r.place_id}: ${r.count} occurrences`);
      });
      console.log('   💡 Fix: Update duplicates to NULL or merge records');
      hasErrors = true;
    }

    return results.length === 0;
  } catch (error) {
    console.error('   ❌ Error checking duplicates:', error.message);
    hasErrors = true;
    return false;
  }
}

// ─── 5. Verify Indexes ────────────────────────────────────────────────────────
async function checkIndexes() {
  console.log('\n5️⃣  Checking Database Indexes...');
  try {
    const [results] = await sequelize.query(`
      SELECT indexname, tablename
      FROM pg_indexes
      WHERE tablename IN ('address', 'parcel')
      ORDER BY tablename, indexname;
    `);

    const requiredIndexes = [
      'idx_address_place_id',
      'idx_address_coordinates',
      'idx_address_city_locality'
    ];

    const existingIndexes = results.map(r => r.indexname);
    const missingIndexes = requiredIndexes.filter(idx => !existingIndexes.includes(idx));

    if (missingIndexes.length === 0) {
      console.log('   ✅ All required indexes exist');
      console.log(`   📋 Total indexes: ${results.length}`);
    } else {
      console.warn('   ⚠️  Missing indexes:', missingIndexes.join(', '));
      console.log('   💡 Indexes will be created on next server restart');
    }

    return true;
  } catch (error) {
    console.error('   ❌ Error checking indexes:', error.message);
    return false;
  }
}

// ─── 6. Verify parcel_type Semantics ──────────────────────────────────────────
async function checkParcelTypeSemantics() {
  console.log('\n6️⃣  Checking parcel_type Column Semantics...');
  try {
    const [results] = await sequelize.query(`
      SELECT data_type, character_maximum_length
      FROM information_schema.columns
      WHERE table_name = 'parcel' AND column_name = 'parcel_type';
    `);

    if (results.length > 0) {
      const col = results[0];
      console.log(`   ℹ️  parcel_type: ${col.data_type}(${col.character_maximum_length || 'unlimited'})`);
      console.log('   ⚠️  IMPORTANT: parcel_type is currently user content (e.g., "Electronics")');
      console.log('   💡 For route classification (SHORT/LONG), consider adding route_category column');
      console.log('   📝 Current usage: User-defined content type, NOT route classification');
    }

    return true;
  } catch (error) {
    console.error('   ❌ Error checking parcel_type:', error.message);
    return false;
  }
}

// ─── 7. Validate Google API Key ───────────────────────────────────────────────
async function checkGoogleAPIKey() {
  console.log('\n7️⃣  Validating Google API Keys...');
  
  const apiKey = process.env.GOOGLE_API_KEY;
  const validationKey = process.env.GOOGLE_ADDRESS_VALIDATION_API_KEY;
  
  // Check main API key
  if (!apiKey) {
    console.error('   ❌ GOOGLE_API_KEY not found in .env');
    hasErrors = true;
    return false;
  }

  if (apiKey === 'your_google_api_key_here') {
    console.error('   ❌ GOOGLE_API_KEY is placeholder value');
    console.log('   💡 Update .env with actual Google API key');
    hasErrors = true;
    return false;
  }

  console.log(`   ✅ Main API Key found: ${apiKey.substring(0, 10)}...`);
  
  // Check validation API key (optional)
  if (!validationKey || validationKey === 'your_address_validation_api_key_here') {
    console.log('   ⚠️  Address Validation API Key: Not configured (optional)');
    console.log('   💡 Set GOOGLE_ADDRESS_VALIDATION_API_KEY for address validation feature');
  } else {
    console.log(`   ✅ Validation API Key found: ${validationKey.substring(0, 10)}...`);
  }

  // Test Geocoding API
  console.log('   🔍 Testing Geocoding API...');
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=Mumbai&key=${apiKey}`;
    const response = await axios.get(url, { timeout: 5000 });
    
    if (response.data.status === 'OK') {
      console.log('   ✅ Geocoding API working');
    } else if (response.data.status === 'REQUEST_DENIED') {
      console.error('   ❌ Geocoding API: REQUEST_DENIED');
      console.log('   � Enable Geocoding API in Google Cloud Console');
      hasErrors = true;
      return false;
    } else {
      console.warn(`   ⚠️  Geocoding API status: ${response.data.status}`);
    }
  } catch (error) {
    console.error('   ❌ Geocoding API test failed:', error.message);
    hasErrors = true;
    return false;
  }

  // Test Places API
  console.log('   🔍 Testing Places Autocomplete API...');
  try {
    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=Mumbai&key=${apiKey}&components=country:in`;
    const response = await axios.get(url, { timeout: 5000 });
    
    if (response.data.status === 'OK') {
      console.log('   ✅ Places Autocomplete API working');
    } else if (response.data.status === 'REQUEST_DENIED') {
      console.error('   ❌ Places API: REQUEST_DENIED');
      console.log('   💡 Enable Places API in Google Cloud Console');
      hasErrors = true;
      return false;
    } else {
      console.warn(`   ⚠️  Places API status: ${response.data.status}`);
    }
  } catch (error) {
    console.error('   ❌ Places API test failed:', error.message);
    hasErrors = true;
    return false;
  }

  return true;
}

// ─── 8. Check Required Google APIs ───────────────────────────────────────────
async function checkRequiredAPIs() {
  console.log('\n8️⃣  Required Google APIs Checklist...');
  console.log('   📋 Ensure these APIs are enabled in Google Cloud Console:');
  console.log('      1. Geocoding API');
  console.log('      2. Places API (New)');
  console.log('      3. Routes API');
  console.log('      4. Address Validation API');
  console.log('   🔗 https://console.cloud.google.com/apis/library');
  return true;
}

// ─── 9. Check CORS Configuration ──────────────────────────────────────────────
async function checkCORSConfig() {
  console.log('\n9️⃣  Checking CORS Configuration...');
  try {
    const serverPath = './server.js';
    const fs = await import('fs');
    const serverContent = fs.readFileSync(serverPath, 'utf8');
    
    // Check for common CORS issues
    const hasPathInOrigin = serverContent.match(/origin.*\/api/);
    
    if (hasPathInOrigin) {
      console.error('   ❌ CORS origin includes path (/api)');
      console.log('   💡 Remove path from origin, use only host:');
      console.log('      ✅ https://book-my-parcel-frontend.vercel.app');
      console.log('      ❌ https://book-my-parcel-frontend.vercel.app/api');
      hasErrors = true;
      return false;
    }

    console.log('   ✅ CORS configuration looks correct');
    console.log('   📝 Verify origins match your frontend URLs');
    return true;
  } catch (error) {
    console.warn('   ⚠️  Could not verify CORS config:', error.message);
    return true;
  }
}

// ─── 10. Sample Data Check ───────────────────────────────────────────────────
async function checkSampleData() {
  console.log('\n🔟 Checking Sample Data...');
  try {
    const addressCount = await Address.count();
    const parcelCount = await Parcel.count();
    const geocodedCount = await Address.count({ where: { place_id: { [sequelize.Op.ne]: null } } });

    console.log(`   📊 Addresses: ${addressCount} total, ${geocodedCount} geocoded`);
    console.log(`   📦 Parcels: ${parcelCount} total`);

    if (geocodedCount > 0) {
      const [sample] = await sequelize.query(`
        SELECT city, place_id, latitude, longitude, validation_status, usage_count
        FROM address
        WHERE place_id IS NOT NULL
        LIMIT 1;
      `);
      
      if (sample.length > 0) {
        console.log('   ✅ Sample geocoded address:');
        console.log(`      City: ${sample[0].city}`);
        console.log(`      Coords: ${sample[0].latitude}, ${sample[0].longitude}`);
        console.log(`      Status: ${sample[0].validation_status || 'N/A'}`);
        console.log(`      Usage: ${sample[0].usage_count} times`);
      }
    }

    return true;
  } catch (error) {
    console.error('   ❌ Error checking sample data:', error.message);
    return false;
  }
}

// ─── Main Verification Flow ──────────────────────────────────────────────────
async function runVerification() {
  try {
    const dbConnected = await checkDatabaseConnection();
    if (!dbConnected) {
      console.log('\n❌ Cannot proceed without database connection');
      process.exit(1);
    }

    await checkAddressColumns();
    await checkParcelColumns();
    await checkPlaceIdDuplicates();
    await checkIndexes();
    await checkParcelTypeSemantics();
    await checkGoogleAPIKey();
    await checkRequiredAPIs();
    await checkCORSConfig();
    await checkSampleData();

    console.log('\n' + '='.repeat(60));
    
    if (hasErrors) {
      console.log('\n❌ VERIFICATION FAILED - Issues found above');
      console.log('   Fix the errors and run verification again\n');
      process.exit(1);
    } else {
      console.log('\n✅ ALL CHECKS PASSED - Phase 1 setup is complete!');
      console.log('   Your parcel creation feature is ready to use\n');
      process.exit(0);
    }

  } catch (error) {
    console.error('\n❌ Verification failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

// Run verification
runVerification();
