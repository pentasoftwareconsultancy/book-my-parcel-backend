/**
 * Migration Script: Populate route_geom column with PostGIS LINESTRING
 * 
 * This script:
 * 1. Reads existing route_geometry (encoded polyline)
 * 2. Decodes to coordinates
 * 3. Creates PostGIS LINESTRING
 * 4. Updates route_geom column
 * 
 * Usage: node backend/migrations/migrate-routes-to-postgis.js
 */

import 'dotenv/config.js';
import sequelize from '../src/config/database.config.js';
import TravellerRoute from '../src/modules/traveller/travellerRoute.model.js';
import { Op } from 'sequelize';
import {
  decodePolyline,
  createLineString,
  polylineToLineString,
} from '../src/services/polylineDecoder.service.js';

async function migrateRoutesToPostGIS() {
  try {
    console.log('🔄 Starting migration: Populate route_geom column');
    console.log('================================================\n');

    // Get all routes with route_geometry
    const routes = await TravellerRoute.findAll({
      where: {
        route_geometry: {
          [Op.ne]: null,
        },
      },
      attributes: ['id', 'route_geometry', 'route_geom'],
      raw: true,
    });

    console.log(`📊 Found ${routes.length} routes with route_geometry\n`);

    if (routes.length === 0) {
      console.log('✅ No routes to migrate');
      process.exit(0);
    }

    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    // Process each route
    for (let i = 0; i < routes.length; i++) {
      const route = routes[i];
      const progress = `[${i + 1}/${routes.length}]`;

      try {
        // Skip if already has geometry
        if (route.route_geom) {
          console.log(`${progress} ⏭️  Route ${route.id} already has geometry (skipping)`);
          skipCount++;
          continue;
        }

        // Decode polyline and create LINESTRING
        const linestring = polylineToLineString(route.route_geometry);

        if (!linestring) {
          console.log(`${progress} ❌ Failed to decode polyline for route ${route.id}`);
          errorCount++;
          continue;
        }

        // Update route with geometry
        await sequelize.query(
          `
          UPDATE traveller_routes
          SET route_geom = ST_GeomFromText(:linestring, 4326)
          WHERE id = :routeId
          `,
          {
            replacements: {
              linestring,
              routeId: route.id,
            },
          }
        );

        console.log(`${progress} ✅ Migrated route ${route.id}`);
        successCount++;
      } catch (error) {
        console.error(`${progress} ❌ Error migrating route ${route.id}:`, error.message);
        errorCount++;
      }
    }

    console.log('\n================================================');
    console.log('📈 Migration Summary');
    console.log('================================================');
    console.log(`✅ Successful: ${successCount}`);
    console.log(`⏭️  Skipped: ${skipCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log(`📊 Total: ${routes.length}`);

    if (errorCount === 0) {
      console.log('\n✅ Migration completed successfully!');
    } else {
      console.log(`\n⚠️  Migration completed with ${errorCount} errors`);
    }

    process.exit(errorCount > 0 ? 1 : 0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
migrateRoutesToPostGIS();
