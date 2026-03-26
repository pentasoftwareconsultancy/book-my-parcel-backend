import sequelize from "../src/config/database.config.js";
import "../src/modules/associations.js";
import User from "../src/modules/user/user.model.js";
import UserProfile from "../src/modules/user/userProfile.model.js";
import TravellerProfile from "../src/modules/traveller/travellerProfile.model.js";
import TravellerRoute from "../src/modules/traveller/travellerRoute.model.js";
import Address from "../src/modules/parcel/address.model.js";
import Parcel from "../src/modules/parcel/parcel.model.js";
import ParcelRequest from "../src/modules/matching/parcelRequest.model.js";
import Booking from "../src/modules/booking/booking.model.js";
import Role from "../src/modules/user/role.model.js";
import UserRole from "../src/modules/user/userRole.model.js";
import bcrypt from "bcrypt";

const TEST_USER_EMAIL = "vivekjangam126@gmail.com";
const TEST_USER_PASSWORD = "Vivek@1260";

async function clearUserData(userEmail) {
  console.log(`🗑️ Clearing all data for user: ${userEmail}`);
  
  const user = await User.findOne({ where: { email: userEmail } });
  if (!user) {
    console.log("User not found, nothing to clear");
    return null;
  }

  // Delete in correct order to avoid foreign key constraints
  
  // 1. Delete parcel requests for this traveller
  await ParcelRequest.destroy({ where: { traveller_id: user.id } });
  
  // 2. Delete bookings where this user is the traveller
  await Booking.destroy({ where: { traveller_id: user.id } });
  
  // 3. Find and delete bookings for parcels owned by this user
  const userParcels = await Parcel.findAll({ 
    where: { user_id: user.id },
    attributes: ['id']
  });
  const parcelIds = userParcels.map(p => p.id);
  if (parcelIds.length > 0) {
    await Booking.destroy({ where: { parcel_id: parcelIds } });
  }
  
  // 4. Delete parcel requests for parcels owned by this user
  if (parcelIds.length > 0) {
    await ParcelRequest.destroy({ where: { parcel_id: parcelIds } });
  }
  
  // 5. Delete parcels owned by this user
  await Parcel.destroy({ where: { user_id: user.id } });
  
  // 6. Delete traveller routes
  const travellerProfile = await TravellerProfile.findOne({ where: { user_id: user.id } });
  if (travellerProfile) {
    await TravellerRoute.destroy({ where: { traveller_profile_id: travellerProfile.id } });
  }
  
  // 7. Delete traveller profile
  await TravellerProfile.destroy({ where: { user_id: user.id } });
  
  // 8. Delete user profile
  await UserProfile.destroy({ where: { user_id: user.id } });
  
  // 9. Delete user roles
  await UserRole.destroy({ where: { user_id: user.id } });
  
  // 10. Finally delete the user
  await User.destroy({ where: { id: user.id } });

  console.log("✅ User data cleared successfully");
  return user.id;
}

async function createTestUser() {
  console.log("👤 Creating test user...");
  
  const hashedPassword = await bcrypt.hash(TEST_USER_PASSWORD, 10);
  
  const user = await User.create({
    email: TEST_USER_EMAIL,
    password: hashedPassword,
    phone_number: "9767996768",
    is_active: true,
    is_verified: true
  });

  // Create user profile
  await UserProfile.create({
    user_id: user.id,
    name: "Vivek Jangam",
    city: "Pune",
    state: "Maharashtra",
    pincode: "411001"
  });

  // Assign INDIVIDUAL and TRAVELLER roles
  const individualRole = await Role.findOne({ where: { name: "INDIVIDUAL" } });
  const travellerRole = await Role.findOne({ where: { name: "TRAVELLER" } });
  
  await UserRole.bulkCreate([
    { user_id: user.id, role_id: individualRole.id },
    { user_id: user.id, role_id: travellerRole.id }
  ]);

  // Create traveller profile
  await TravellerProfile.create({
    user_id: user.id,
    vehicle_type: "Car",
    vehicle_number: "MH12AB1234",
    vehicle_model: "Honda City",
    capacity_kg: 50,
    rating: 4.8,
    total_deliveries: 150,
    last_known_location: {
      type: 'Point',
      coordinates: [73.8567, 18.5204] // [longitude, latitude]
    }
  });

  console.log("✅ Test user created successfully");
  return user;
}

async function createAddresses() {
  console.log("📍 Creating addresses...");
  
  // Get test phone number from environment or use default
  const testPhone = process.env.TEST_PHONE_NUMBER || "9876543210";
  console.log(`📱 Using test phone number: ${testPhone}`);
  
  const addresses = await Address.bulkCreate([
    {
      type: "pickup",
      name: "Vivek Jangam",
      phone: testPhone,
      address: "FC Road, Pune",
      city: "Pune",
      state: "Maharashtra",
      pincode: "411004",
      country: "India",
      latitude: 18.5204,
      longitude: 73.8567
    },
    {
      type: "delivery",
      name: "Recipient Name",
      phone: testPhone,
      address: "Koregaon Park, Pune", 
      city: "Pune",
      state: "Maharashtra",
      pincode: "411001",
      country: "India",
      latitude: 18.5362,
      longitude: 73.8958
    },
    {
      type: "pickup",
      name: "Vivek Jangam",
      phone: testPhone,
      address: "Bandra West, Mumbai",
      city: "Mumbai", 
      state: "Maharashtra",
      pincode: "400050",
      country: "India",
      latitude: 19.0596,
      longitude: 72.8295
    },
    {
      type: "delivery",
      name: "Recipient Name",
      phone: testPhone,
      address: "Andheri East, Mumbai",
      city: "Mumbai",
      state: "Maharashtra", 
      pincode: "400069",
      country: "India",
      latitude: 19.1136,
      longitude: 72.8697
    },
    {
      type: "pickup",
      name: "Vivek Jangam",
      phone: testPhone,
      address: "MG Road, Bangalore",
      city: "Bangalore",
      state: "Karnataka",
      pincode: "560001",
      country: "India",
      latitude: 12.9716,
      longitude: 77.5946
    },
    {
      type: "delivery",
      name: "Recipient Name",
      phone: testPhone,
      address: "Whitefield, Bangalore",
      city: "Bangalore",
      state: "Karnataka",
      pincode: "560066",
      country: "India",
      latitude: 12.9698,
      longitude: 77.7500
    }
  ]);

  console.log("✅ Addresses created successfully");
  return addresses;
}

async function createTravellerRoute(user, addresses) {
  console.log("🛣️ Creating traveller route...");
  
  const travellerProfile = await TravellerProfile.findOne({ where: { user_id: user.id } });
  
  const route = await TravellerRoute.create({
    traveller_profile_id: travellerProfile.id,
    origin_address_id: addresses[0].id, // Pune FC Road
    dest_address_id: addresses[2].id,   // Mumbai Bandra
    departure_date: new Date('2026-03-21'),
    departure_time: '09:00:00',
    arrival_date: new Date('2026-03-21'),
    arrival_time: '12:00:00',
    is_recurring: false,
    vehicle_type: "Car",
    vehicle_number: "MH12AB1234",
    max_weight_kg: 50,
    available_capacity_kg: 50,
    accepted_parcel_types: ["Documents", "Electronics", "Clothing"],
    min_earning_per_delivery: 200,
    route_geometry: "encoded_polyline_here",
    total_distance_km: 150.5,
    total_duration_minutes: 180,
    status: "ACTIVE"
  });

  console.log("✅ Traveller route created successfully");
  return route;
}

async function createTestParcels(user, addresses, route) {
  console.log("📦 Creating test parcels with different statuses...");
  
  const parcels = [];
  const parcelRequests = [];
  const bookings = [];

  // 1. CREATED - User just created parcel, matching in progress
  const parcel1 = await Parcel.create({
    user_id: user.id,
    parcel_ref: "BMP001",
    pickup_address_id: addresses[0].id,
    delivery_address_id: addresses[1].id,
    parcel_type: "Documents",
    package_size: "small",
    weight: 2,
    description: "Important business documents",
    price_quote: 150,
    is_urgent: false,
    status: "CREATED"
  });
  parcels.push(parcel1);

  // 2. MATCHING - System is finding travellers
  const parcel2 = await Parcel.create({
    user_id: user.id,
    parcel_ref: "BMP002", 
    pickup_address_id: addresses[1].id,
    delivery_address_id: addresses[2].id,
    parcel_type: "Electronics",
    package_size: "medium",
    weight: 5,
    description: "Mobile phone and accessories",
    price_quote: 250,
    is_urgent: true,
    status: "MATCHING"
  });
  parcels.push(parcel2);

  // Create parcel request for parcel2 - SENT status
  const request1 = await ParcelRequest.create({
    parcel_id: parcel2.id,
    route_id: route.id,
    traveller_id: user.id,
    status: "SENT",
    match_score: 85.5,
    detour_km: 5.2,
    detour_percentage: 8.5,
    sent_at: new Date(),
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
  });
  parcelRequests.push(request1);

  // 3. MATCHING with ACCEPTED request
  const parcel3 = await Parcel.create({
    user_id: user.id,
    parcel_ref: "BMP003",
    pickup_address_id: addresses[2].id,
    delivery_address_id: addresses[3].id,
    parcel_type: "Clothing",
    package_size: "large", 
    weight: 8,
    description: "Designer clothes for wedding",
    price_quote: 300,
    is_urgent: false,
    status: "MATCHING"
  });
  parcels.push(parcel3);

  // Create parcel request - ACCEPTED status
  const request2 = await ParcelRequest.create({
    parcel_id: parcel3.id,
    route_id: route.id,
    traveller_id: user.id,
    status: "ACCEPTED",
    match_score: 92.0,
    detour_km: 3.1,
    detour_percentage: 5.2,
    sent_at: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
    responded_at: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1 hour ago
    expires_at: new Date(Date.now() + 22 * 60 * 60 * 1000)
  });
  parcelRequests.push(request2);

  // 4. MATCHING with SELECTED request (user selected this traveller)
  const parcel4 = await Parcel.create({
    user_id: user.id,
    parcel_ref: "BMP004",
    pickup_address_id: addresses[3].id,
    delivery_address_id: addresses[4].id,
    parcel_type: "Books",
    package_size: "medium",
    weight: 4,
    description: "Educational textbooks",
    price_quote: 200,
    is_urgent: false,
    status: "MATCHING"
  });
  parcels.push(parcel4);

  const request3 = await ParcelRequest.create({
    parcel_id: parcel4.id,
    route_id: route.id,
    traveller_id: user.id,
    status: "SELECTED",
    match_score: 88.7,
    detour_km: 7.5,
    detour_percentage: 12.3,
    sent_at: new Date(Date.now() - 4 * 60 * 60 * 1000),
    responded_at: new Date(Date.now() - 3 * 60 * 60 * 1000),
    expires_at: new Date(Date.now() + 20 * 60 * 60 * 1000)
  });
  parcelRequests.push(request3);

  // 5. CONFIRMED - Booking created, waiting for pickup
  const parcel5 = await Parcel.create({
    user_id: user.id,
    parcel_ref: "BMP005",
    pickup_address_id: addresses[4].id,
    delivery_address_id: addresses[5].id,
    parcel_type: "Electronics",
    package_size: "small",
    weight: 3,
    description: "Laptop charger and cables",
    price_quote: 180,
    is_urgent: true,
    status: "CONFIRMED"
  });
  parcels.push(parcel5);

  const booking1 = await Booking.create({
    parcel_id: parcel5.id,
    traveller_id: user.id,
    booking_ref: "BOOK001",
    status: "CONFIRMED",
    assigned_date: new Date(),
    pickup_scheduled_time: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours from now
    delivery_estimated_time: new Date(Date.now() + 8 * 60 * 60 * 1000) // 8 hours from now
  });
  bookings.push(booking1);

  console.log("✅ Test parcels created successfully");
  console.log(`📊 Created ${parcels.length} parcels, ${parcelRequests.length} requests, ${bookings.length} bookings`);
  
  return { parcels, parcelRequests, bookings };
}

async function seedTestData() {
  try {
    console.log("🌱 Starting test data seeding...");
    
    // Clear existing data
    await clearUserData(TEST_USER_EMAIL);
    
    // Create fresh test data
    const user = await createTestUser();
    const addresses = await createAddresses();
    const route = await createTravellerRoute(user, addresses);
    const { parcels, parcelRequests, bookings } = await createTestParcels(user, addresses, route);
    
    console.log("\n🎉 Test data seeding completed successfully!");
    console.log("\n📋 Summary:");
    console.log(`👤 User: ${user.email}`);
    console.log(`📍 Addresses: ${addresses.length}`);
    console.log(`🛣️ Routes: 1`);
    console.log(`📦 Parcels: ${parcels.length}`);
    console.log(`📨 Parcel Requests: ${parcelRequests.length}`);
    console.log(`📋 Bookings: ${bookings.length}`);
    
    console.log("\n🔄 Status Distribution:");
    console.log("User Side (Parcel Status):");
    console.log("- CREATED: 1 (just created, matching in progress)");
    console.log("- MATCHING: 3 (finding travellers)");
    console.log("- CONFIRMED: 1 (booking created, waiting pickup)");
    
    console.log("\nTraveller Side (Request/Booking Status):");
    console.log("- SENT: 1 (request sent, awaiting response)");
    console.log("- ACCEPTED: 1 (accepted by traveller)");
    console.log("- SELECTED: 1 (selected by user)");
    console.log("- CONFIRMED: 1 (booking confirmed)");
    
    console.log(`\n🔑 Login Credentials:`);
    console.log(`Email: ${TEST_USER_EMAIL}`);
    console.log(`Password: ${TEST_USER_PASSWORD}`);
    
  } catch (error) {
    console.error("❌ Error seeding test data:", error);
    throw error;
  }
}

// Run the seeding
seedTestData()
  .then(() => {
    console.log("✅ Seeding completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  });