import sequelize from './src/config/database.config.js';
import dotenv from 'dotenv';

dotenv.config();

console.log('\n🔧 PHASE 1 ISSUE FIXER\n');
console.log('='.repeat(60));

// ─── Fix 1: Add Missing Address Columns ──────────────────────────────────────
async function addMissingAddressColumns() {
  console.log('\n1️⃣  Adding missing address columns...');
  
  const columns = [
    { name: 'place_id', type: 'VARCHAR(500)', constraint: 'UNIQUE' },
    { name: 'latitude', type: 'DECIMAL(10, 8)' },
    { name: 'longitude', type: 'DECIMAL(11, 8)' },
    { name: 'plus_code', type: 'VARCHAR(20)' },
    { name: 'validation_status', type: "VARCHAR(20) CHECK (validation_status IN ('VALID', 'PARTIAL', 'INFERRED'))" },
    { name: 'district', type: 'VARCHAR(100)' },
    { name: 'taluka', type: 'VARCHAR(100)' },
    { name: 'locality', type: 'VARCHAR(200)' },
    { name: 'landmarks', type: 'JSONB' },
    { name: 'sub_localities', type: 'JSONB' },
    { name: 'formatted_address', type: 'TEXT' },
    { name: 'last_geocoded_at', type: 'TIMESTAMP' },
    { name: 'usage_count', type: 'INTEGER DEFAULT 1 NOT NULL' }
  ];

  for (const col of columns) {
    try {
      await sequelize.query(`
        ALTER TABLE address 
        ADD COLUMN IF NOT EXISTS ${col.name} ${col.type} ${col.constraint || ''};
      `);
      console.log(`   ✅ Added/verified: ${col.name}`);
    } catch (error) {
      console.error(`   ❌ Failed to add ${col.name}:`, error.message);
    }
  }
}

// ─── Fix 2: Add Missing Parcel Columns ───────────────────────────────────────
async function addMissingParcelColumns() {
  console.log('\n2️⃣  Adding missing parcel columns...');
  
  const columns = [
    { name: 'route_distance_km', type: 'FLOAT' },
    { name: 'route_duration_minutes', type: 'FLOAT' },
    { name: 'intermediate_cities', type: 'JSONB' },
    { name: 'route_geometry', type: 'TEXT' }
  ];

  for (const col of columns) {
    try {
      await sequelize.query(`
        ALTER TABLE parcel 
        ADD COLUMN IF NOT EXISTS ${col.name} ${col.type};
      `);
      console.log(`   ✅ Added/verified: ${col.name}`);
    } catch (error) {
      console.error(`   ❌ Failed to add ${col.name}:`, error.message);
    }
  }
}

// ─── Fix 3: Create Missing Indexes ───────────────────────────────────────────
async function createMissingIndexes() {
  console.log('\n3️⃣  Creating missing indexes...');
  
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_address_place_id ON address(place_id);',
    'CREATE INDEX IF NOT EXISTS idx_address_coordinates ON address(latitude, longitude);',
    'CREATE INDEX IF NOT EXISTS idx_address_city_locality ON address(city, locality);'
  ];

  for (const idx of indexes) {
    try {
      await sequelize.query(idx);
      console.log(`   ✅ Created/verified index`);
    } catch (error) {
      console.error(`   ❌ Failed to create index:`, error.message);
    }
  }
}

// ─── Fix 4: Remove Duplicate place_id Values ─────────────────────────────────
async function fixDuplicatePlaceIds() {
  console.log('\n4️⃣  Fixing duplicate place_id values...');
  
  try {
    // Find duplicates
    const [duplicates] = await sequelize.query(`
      SELECT place_id, COUNT(*) as count
      FROM address
      WHERE place_id IS NOT NULL
      GROUP BY place_id
      HAVING COUNT(*) > 1;
    `);

    if (duplicates.length === 0) {
      console.log('   ✅ No duplicates found');
      return;
    }

    console.log(`   Found ${duplicates.length} duplicate place_ids`);

    // For each duplicate, keep the most recent one and nullify others
    for (const dup of duplicates) {
      await sequelize.query(`
        UPDATE address
        SET place_id = NULL
        WHERE place_id = :placeId
        AND id NOT IN (
          SELECT id FROM address
          WHERE place_id = :placeId
          ORDER BY "createdAt" DESC
          LIMIT 1
        );
      `, {
        replacements: { placeId: dup.place_id }
      });
      console.log(`   ✅ Fixed duplicates for: ${dup.place_id}`);
    }

  } catch (error) {
    console.error('   ❌ Failed to fix duplicates:', error.message);
  }
}

// ─── Fix 5: Verify ENUM Types ────────────────────────────────────────────────
async function verifyEnumTypes() {
  console.log('\n5️⃣  Verifying ENUM types...');
  
  try {
    // Check if validation_status enum exists
    const [enums] = await sequelize.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_type 
        WHERE typname = 'enum_address_validation_status'
      ) as exists;
    `);

    if (!enums[0].exists) {
      console.log('   Creating validation_status ENUM...');
      await sequelize.query(`
        CREATE TYPE enum_address_validation_status AS ENUM ('VALID', 'PARTIAL', 'INFERRED');
      `);
      
      await sequelize.query(`
        ALTER TABLE address 
        ALTER COLUMN validation_status TYPE enum_address_validation_status 
        USING validation_status::enum_address_validation_status;
      `);
      console.log('   ✅ ENUM type created');
    } else {
      console.log('   ✅ ENUM type already exists');
    }

  } catch (error) {
    console.warn('   ⚠️  ENUM verification skipped:', error.message);
  }
}

// ─── Main Fix Flow ───────────────────────────────────────────────────────────
async function runFixes() {
  try {
    console.log('\n🔌 Connecting to database...');
    await sequelize.authenticate();
    console.log('✅ Connected\n');

    await addMissingAddressColumns();
    await addMissingParcelColumns();
    await createMissingIndexes();
    await fixDuplicatePlaceIds();
    await verifyEnumTypes();

    console.log('\n' + '='.repeat(60));
    console.log('\n✅ ALL FIXES APPLIED');
    console.log('   Run: node verify-phase1-setup.js to verify\n');

  } catch (error) {
    console.error('\n❌ Fix failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

// Run fixes
runFixes();
