/**
 * Migration Script: Populate route_places table from existing routes
 * Purpose: Convert existing array-based place data to Place-ID based records
 * Usage: node migrate-existing-routes-to-places.js
 */

import sequelize from "../src/config/database.config.js";
import "../src/modules/associations.js";
import TravellerRoute from "../src/modules/traveller/travellerRoute.model.js";
import { extractAndStorePlaces } from "../src/services/placeExtraction.service.js";

const migrateExistingRoutes = async () => {
  try {
    await sequelize.authenticate();
    console.log("✓ Connected to database");

    // Fetch all routes with intermediate data
    const routes = await TravellerRoute.findAll({
      attributes: [
        "id",
        "localities_passed",
        "cities_passed",
        "talukas_passed",
        "pincodes_covered",
        "landmarks_nearby",
      ],
      raw: true,
    });

    console.log(`\nFound ${routes.length} routes to migrate`);

    let successCount = 0;
    let errorCount = 0;

    for (const route of routes) {
      try {
        const intermediateData = {
          localities: route.localities_passed || [],
          cities: route.cities_passed || [],
          talukas: route.talukas_passed || [],
          pincodes: route.pincodes_covered || [],
          landmarks: route.landmarks_nearby || [],
        };

        // Extract and store places for this route
        const placesCount = await extractAndStorePlaces(route.id, intermediateData, null);
        console.log(`✓ Route ${route.id}: ${placesCount} places stored`);
        successCount++;
      } catch (error) {
        console.error(`✗ Route ${route.id}: ${error.message}`);
        errorCount++;
      }
    }

    console.log(`\n========== MIGRATION SUMMARY ==========`);
    console.log(`Total routes: ${routes.length}`);
    console.log(`Successfully migrated: ${successCount}`);
    console.log(`Failed: ${errorCount}`);
    console.log(`========================================\n`);

    if (errorCount === 0) {
      console.log("✓ Migration completed successfully!");
    } else {
      console.log(`⚠ Migration completed with ${errorCount} errors`);
    }

    await sequelize.close();
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
};

migrateExistingRoutes();
