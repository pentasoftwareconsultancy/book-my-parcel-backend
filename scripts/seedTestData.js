import dotenv from "dotenv";
import bcrypt from "bcrypt";
import chalk from "chalk";
import { Sequelize } from "sequelize";
import { randomUUID } from "crypto";
import sequelize from "../src/config/database.config.js";

dotenv.config();

const CITIES = [
  { city: "Mumbai", state: "Maharashtra", pincode: "400001", lat: 19.076, lng: 72.8777 },
  { city: "Pune", state: "Maharashtra", pincode: "411001", lat: 18.5204, lng: 73.8567 },
  { city: "Nashik", state: "Maharashtra", pincode: "422001", lat: 19.9975, lng: 73.7898 },
  { city: "Nagpur", state: "Maharashtra", pincode: "440001", lat: 21.1458, lng: 79.0882 },
  { city: "Aurangabad", state: "Maharashtra", pincode: "431001", lat: 19.8762, lng: 75.3433 },
];

const FALLBACK_ROLES = ["customer", "traveler", "partner", "support", "manager"];
const ADMIN_ROLE_REGEX = /^admin$/i;
const TRAVELER_ROLE_REGEX = /(travel|travell|traveler|traveller)/i;
const USER_PASSWORD = "User@12345";
const PASSWORD_HASH_ROUNDS = 10;

const TABLE_ALIASES = {
  roles: ["roles"],
  users: ["users"],
  user_roles: ["user_roles"],
  user_profiles: ["user_profiles"],
  traveller_profiles: ["traveller_profiles"],
  wallets: ["wallets", "wallet"],
  addresses: ["address", "addresses"],
  traveller_routes: ["traveller_routes"],
  route_places: ["route_places"],
  parcels: ["parcel"],
  parcel_requests: ["parcel_requests"],
  parcel_acceptances: ["parcel_acceptances"],
  bookings: ["booking"],
  booking_status_logs: ["booking_status_logs"],
  pending_payment: ["pending_payment", "pending_payments"],
  chat_messages: ["chat_messages"],
  delivery_attempts: ["delivery_attempts"],
  payments: ["payments", "payment"],
  parcel_trackings: ["parcel_trackings", "parcel_tracking"],
  feedbacks: ["feedbacks", "feedback"],
  disputes: ["disputes", "dispute"],
  notifications: ["notifications", "notification"],
  user_device_tokens: ["user_device_tokens"],
  referrals: ["referrals"],
  wallet_transactions: ["wallet_transactions"],
  refunds: ["refunds"],
  withdrawals: ["withdrawals"],
};

const tableCache = new Map();
const columnCache = new Map();
const columnMetaCache = new Map();

function log(message) {
  console.log(message);
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function titleCase(value) {
  return String(value)
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function quoteIdent(identifier) {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min, max, digits = 2) {
  const value = Math.random() * (max - min) + min;
  return Number(value.toFixed(digits));
}

function pick(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function hoursAgo(hours) {
  const date = new Date();
  date.setHours(date.getHours() - hours);
  return date;
}

function minutesAgo(minutes) {
  const date = new Date();
  date.setMinutes(date.getMinutes() - minutes);
  return date;
}

function plusDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function plusHours(date, hours) {
  const copy = new Date(date);
  copy.setHours(copy.getHours() + hours);
  return copy;
}

async function tableExists(tableName) {
  if (tableCache.has(tableName)) {
    return tableCache.get(tableName);
  }

  const [rows] = await sequelize.query(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.tables
       WHERE table_schema = current_schema()
         AND table_name = $1
     ) AS exists`,
    { bind: [tableName] }
  );

  const exists = Boolean(rows?.[0]?.exists);
  tableCache.set(tableName, exists);
  return exists;
}

async function getTableName(candidates) {
  for (const candidate of candidates) {
    if (await tableExists(candidate)) {
      return candidate;
    }
  }
  return null;
}

async function getColumns(tableName) {
  if (columnCache.has(tableName)) {
    return columnCache.get(tableName);
  }

  const [rows] = await sequelize.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = $1
     ORDER BY ordinal_position`,
    { bind: [tableName] }
  );

  const columns = rows.map((row) => row.column_name);
  const set = new Set(columns);
  columnCache.set(tableName, set);
  return set;
}

async function getColumnMeta(tableName) {
  if (columnMetaCache.has(tableName)) {
    return columnMetaCache.get(tableName);
  }

  const [rows] = await sequelize.query(
    `SELECT column_name, data_type, column_default, is_identity
     FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = $1
     ORDER BY ordinal_position`,
    { bind: [tableName] }
  );

  const meta = new Map(rows.map((row) => [row.column_name, row]));
  columnMetaCache.set(tableName, meta);
  return meta;
}

async function selectOne(tableName, criteria) {
  const keys = Object.keys(criteria);
  if (!keys.length) {
    return null;
  }

  const clauses = keys.map((key, index) => `${quoteIdent(key)} = $${index + 1}`);
  const values = keys.map((key) => criteria[key]);
  const query = `SELECT * FROM ${quoteIdent(tableName)} WHERE ${clauses.join(" AND ")} LIMIT 1`;
  const [rows] = await sequelize.query(query, { bind: values });
  return rows[0] || null;
}

function applyTimestamps(tableName, row, when) {
  row.createdAt = when;
  row.updatedAt = when;
  row.created_at = when;
  row.updated_at = when;

  return row;
}

async function insertRow(tableName, row) {
  const meta = await getColumnMeta(tableName);
  const idMeta = meta.get("id");
  if (row.id == null && idMeta) {
    const isUuidLike = String(idMeta.data_type).toLowerCase() === "uuid"
      || String(idMeta.column_default || "").toLowerCase().includes("uuid")
      || String(idMeta.column_default || "").toLowerCase().includes("gen_random_uuid")
      || String(idMeta.column_default || "").toLowerCase().includes("uuid_generate_v4");

    const isNumericIdentity = ["integer", "bigint", "smallint"].includes(String(idMeta.data_type).toLowerCase())
      && (String(idMeta.column_default || "").toLowerCase().includes("nextval") || String(idMeta.is_identity).toUpperCase() === "YES");

    if (isUuidLike && !isNumericIdentity) {
      row.id = randomUUID();
    }
  }

  const columns = await getColumns(tableName);
  const entries = Object.entries(row)
    .filter(([key]) => columns.has(key))
    .map(([key, value]) => {
      const columnMeta = meta.get(key);
      const dataType = String(columnMeta?.data_type || "").toLowerCase();
      if (value != null && (dataType === "json" || dataType === "jsonb")) {
        return [key, JSON.stringify(value)];
      }
      return [key, value];
    });

  if (!entries.length) {
    throw new Error(`No matching columns found for ${tableName}`);
  }

  const insertColumns = entries.map(([key]) => quoteIdent(key)).join(", ");
  const placeholders = entries.map((_, index) => `$${index + 1}`).join(", ");
  const values = entries.map(([, value]) => value);

  const query = `INSERT INTO ${quoteIdent(tableName)} (${insertColumns}) VALUES (${placeholders}) RETURNING *`;
  const [rows] = await sequelize.query(query, { bind: values });
  return rows[0];
}

async function ensureRow(tableName, criteria, row) {
  const existing = await selectOne(tableName, criteria);
  if (existing) {
    return existing;
  }
  return insertRow(tableName, row);
}

function safePhone(sequence) {
  return `+91900000${String(sequence).padStart(4, "0")}`;
}

function safeAltPhone(sequence) {
  return `+91910000${String(sequence).padStart(4, "0")}`;
}

function emailFor(roleName, index) {
  const prefix = slugify(roleName || "user");
  return `${prefix}${index}@example.com`;
}

function profileImageFor(roleName, index) {
  const prefix = slugify(roleName || "user");
  return `https://example.com/assets/avatars/${prefix}-${index}.png`;
}

function parcelTrackingNumber(index) {
  return `TRK${String(index).padStart(8, "0")}`;
}

function bookingReference(index) {
  return `BK${String(index).padStart(8, "0")}`;
}

function deliveryReference(index) {
  return `DL${String(index).padStart(8, "0")}`;
}

function paymentReference(index) {
  return `TXN${String(index).padStart(10, "0")}`;
}

function parcelReference(index) {
  return `PCL${String(index).padStart(8, "0")}`;
}

function referralCodeFor(userIndex) {
  return `REF${String(userIndex).padStart(9, "0")}`.slice(0, 12);
}

function roleDisplayName(roleName) {
  return titleCase(roleName).replace(/\bId\b/g, "ID");
}

function cityForIndex(index) {
  return CITIES[index % CITIES.length];
}

function buildAddressDetails(city, index, kind) {
  const addressNumber = index + 1;
  const locality = kind === "pickup" ? "Main Road" : "Station Road";
  return {
    type: kind,
    name: `${city.city} ${kind === "pickup" ? "Pickup" : "Delivery"} ${addressNumber}`,
    address: `${addressNumber}, ${locality}, ${city.city}`,
    city: city.city,
    state: city.state,
    pincode: city.pincode,
    country: "India",
    phone: safePhone(addressNumber),
    alt_phone: safeAltPhone(addressNumber),
    place_id: `${slugify(kind)}-${slugify(city.city)}-${addressNumber}`,
    latitude: Number((city.lat + randomFloat(-0.03, 0.03, 6)).toFixed(6)),
    longitude: Number((city.lng + randomFloat(-0.03, 0.03, 6)).toFixed(6)),
    plus_code: `9J${String(100000 + addressNumber).slice(-6)}`,
    validation_status: "VALID",
    district: city.city,
    taluka: city.city,
    locality,
    landmarks: ["Bus Stand", "Post Office"],
    sub_localities: ["Central"],
    formatted_address: `${addressNumber}, ${locality}, ${city.city}, ${city.state} ${city.pincode}, India`,
    last_geocoded_at: daysAgo(randomInt(0, 14)),
    usage_count: randomInt(1, 10),
  };
}

async function seedRoles() {
  const rolesTable = await getTableName(TABLE_ALIASES.roles);
  if (!rolesTable) {
    throw new Error("roles table not found");
  }

  const [existingRoles] = await sequelize.query(`SELECT * FROM ${quoteIdent(rolesTable)} ORDER BY 1`);
  const currentNames = existingRoles.map((role) => role.name);
  const hasTravelerLike = currentNames.some((name) => TRAVELER_ROLE_REGEX.test(name));

  const rolesToUse = currentNames.filter((name) => !ADMIN_ROLE_REGEX.test(name));

  if (rolesToUse.length === 0) {
    rolesToUse.push(...FALLBACK_ROLES);
  }

  if (!hasTravelerLike && !rolesToUse.some((name) => TRAVELER_ROLE_REGEX.test(name))) {
    rolesToUse.push("traveler");
  }

  const roles = [];
  for (const roleName of rolesToUse) {
    const existing = existingRoles.find((role) => String(role.name).toLowerCase() === String(roleName).toLowerCase());
    if (existing) {
      roles.push(existing);
      continue;
    }

    const inserted = await insertRow(rolesTable, { name: roleName });
    roles.push(inserted);
  }

  log(chalk.green(`✓ Roles ready: ${roles.map((role) => role.name).join(", ")}`));
  return { rolesTable, roles };
}

async function seedUsersAndRoles(roles) {
  const usersTable = await getTableName(TABLE_ALIASES.users);
  const userRolesTable = await getTableName(TABLE_ALIASES.user_roles);
  if (!usersTable || !userRolesTable) {
    throw new Error("users or user_roles table not found");
  }

  const passwordHash = await bcrypt.hash(USER_PASSWORD, PASSWORD_HASH_ROUNDS);
  const users = [];
  const userRoleLinks = [];

  for (const role of roles) {
    const roleName = role.name;
    const roleSlug = slugify(roleName);

    for (let index = 1; index <= 5; index += 1) {
      const email = emailFor(roleSlug, index);
      const phoneNumber = safePhone(`${roles.indexOf(role) + 1}${index}`.padStart(4, "0"));
      const createdAt = minutesAgo((roles.indexOf(role) * 5 + index) * 17);
      const baseCity = cityForIndex(index - 1);

      const user = await ensureRow(
        usersTable,
        { email },
        applyTimestamps(
          usersTable,
          {
            email,
            password: passwordHash,
            phone_number: phoneNumber,
            alternate_phone: safeAltPhone(`${roles.indexOf(role) + 1}${index}`.padStart(4, "0")),
            password_changed_at: createdAt,
          },
          createdAt
        )
      );

      users.push({
        ...user,
        role_name: roleName,
        role_id: role.id,
        seed_role_slug: roleSlug,
        seed_city: baseCity,
        seed_index: index,
      });

      const linkExists = await selectOne(userRolesTable, { user_id: user.id, role_id: role.id });
      if (!linkExists) {
        const linkRow = applyTimestamps(
          userRolesTable,
          {
            user_id: user.id,
            role_id: role.id,
            assigned_at: createdAt,
          },
          createdAt
        );
        const insertedLink = await insertRow(userRolesTable, linkRow);
        userRoleLinks.push(insertedLink);
      }
    }
  }

  log(chalk.green(`✓ Users ready: ${users.length}`));
  return { usersTable, userRolesTable, users, userRoleLinks };
}

async function seedProfiles(users) {
  const userProfilesTable = await getTableName(TABLE_ALIASES.user_profiles);
  if (!userProfilesTable) {
    log(chalk.yellow("⚠ user_profiles table not found, skipping profiles"));
    return [];
  }

  const profiles = [];
  for (const user of users) {
    const city = user.seed_city;
    const profileName = `${roleDisplayName(user.role_name)} ${user.seed_index}`;
    const referralCode = referralCodeFor(users.indexOf(user) + 1);
    const createdAt = minutesAgo(60 + users.indexOf(user) * 13);

    const profile = await ensureRow(
      userProfilesTable,
      { user_id: user.id },
      applyTimestamps(
        userProfilesTable,
        {
          user_id: user.id,
          name: profileName,
          address: `${user.seed_index} Example Street, ${city.city}`,
          city: city.city,
          state: city.state,
          pincode: city.pincode,
          lat: Number((city.lat + randomFloat(-0.02, 0.02, 6)).toFixed(6)),
          lng: Number((city.lng + randomFloat(-0.02, 0.02, 6)).toFixed(6)),
          avatar_url: profileImageFor(user.role_name, user.seed_index),
          referral_code: referralCode,
        },
        createdAt
      )
    );

    profiles.push(profile);
  }

  log(chalk.green(`✓ User profiles ready: ${profiles.length}`));
  return profiles;
}

async function seedTravellerProfiles(users) {
  const travellerProfilesTable = await getTableName(TABLE_ALIASES.traveller_profiles);
  if (!travellerProfilesTable) {
    log(chalk.yellow("⚠ traveller_profiles table not found, skipping traveller profiles"));
    return [];
  }

  const travellerCandidates = users.filter((user) => TRAVELER_ROLE_REGEX.test(user.role_name));
  const fallback = travellerCandidates.length ? travellerCandidates : users.slice(0, Math.max(5, Math.min(users.length, 8)));
  const travellerUsers = fallback.slice(0, Math.min(8, fallback.length));

  const profiles = [];
  for (const [index, user] of travellerUsers.entries()) {
    const city = user.seed_city;
    const createdAt = minutesAgo(120 + index * 19);
    const status = index % 4 === 0 ? "ACTIVE" : index % 4 === 1 ? "PENDING" : "ACTIVE";
    const profile = await ensureRow(
      travellerProfilesTable,
      { user_id: user.id },
      applyTimestamps(
        travellerProfilesTable,
        {
          user_id: user.id,
          vehicle_type: pick(["bike", "car", "truck"]),
          vehicle_number: `MH${randomInt(10, 99)}${String(randomInt(1000, 9999))}`,
          vehicle_model: pick(["Honda Activa", "Tata Ace", "Maruti Swift", "Mahindra Bolero"]),
          capacity_kg: pick([10, 15, 25, 50]),
          rating: Number(randomFloat(4.2, 5.0, 1)),
          total_deliveries: randomInt(5, 120),
          profile_photo: profileImageFor(user.role_name, user.seed_index),
          status,
          is_available: index % 2 === 0,
          last_known_location: null,
        },
        createdAt
      )
    );

    profiles.push({ ...profile, user });
  }

  log(chalk.green(`✓ Traveller profiles ready: ${profiles.length}`));
  return profiles;
}

async function seedWallets(users) {
  const walletsTable = await getTableName(TABLE_ALIASES.wallets);
  if (!walletsTable) {
    log(chalk.yellow("⚠ wallets table not found, skipping wallets"));
    return [];
  }

  const wallets = [];
  for (const [index, user] of users.entries()) {
    const createdAt = minutesAgo(30 + index * 8);
    const wallet = await ensureRow(
      walletsTable,
      { user_id: user.id },
      applyTimestamps(
        walletsTable,
        {
          user_id: user.id,
          balance: randomFloat(0, 10000, 2),
        },
        createdAt
      )
    );

    wallets.push(wallet);
  }

  log(chalk.green(`✓ Wallets ready: ${wallets.length}`));
  return wallets;
}

async function seedAddresses() {
  const addressesTable = await getTableName(TABLE_ALIASES.addresses);
  if (!addressesTable) {
    log(chalk.yellow("⚠ addresses table not found, skipping addresses"));
    return [];
  }

  const addresses = [];
  let index = 0;
  for (const city of CITIES) {
    for (const kind of ["pickup", "delivery"] ) {
      index += 1;
      const data = buildAddressDetails(city, index, kind);
      const address = await ensureRow(
        addressesTable,
        { place_id: data.place_id },
        applyTimestamps(addressesTable, data, minutesAgo(200 + index * 5))
      );
      addresses.push(address);
    }
  }

  log(chalk.green(`✓ Addresses ready: ${addresses.length}`));
  return addresses;
}

async function seedTravellerRoutes(travellerProfiles, addresses) {
  const routesTable = await getTableName(TABLE_ALIASES.traveller_routes);
  if (!routesTable) {
    log(chalk.yellow("⚠ traveller_routes table not found, skipping traveller routes"));
    return [];
  }

  const routes = [];
  for (const [travellerIndex, traveller] of travellerProfiles.entries()) {
    for (let routeIndex = 0; routeIndex < 2; routeIndex += 1) {
      const origin = addresses[(travellerIndex * 2 + routeIndex) % addresses.length];
      const destination = addresses[(travellerIndex * 2 + routeIndex + 3) % addresses.length];
      const departure = plusHours(minutesAgo(240 - travellerIndex * 17), routeIndex * 6);
      const arrival = plusHours(departure, randomInt(2, 8));
      const route = await ensureRow(
        routesTable,
        {
          traveller_profile_id: traveller.id,
          origin_address_id: origin.id,
          dest_address_id: destination.id,
          departure_date: departure.toISOString().slice(0, 10),
          departure_time: departure.toISOString().slice(11, 19),
          vehicle_type: traveller.vehicle_type || "bike",
          transport_mode: routeIndex % 3 === 0 ? "private" : routeIndex % 3 === 1 ? "bus" : "train",
          max_weight_kg: traveller.capacity_kg || 20,
          status: "ACTIVE",
        },
        applyTimestamps(
          routesTable,
          {
            traveller_profile_id: traveller.id,
            origin_address_id: origin.id,
            dest_address_id: destination.id,
            departure_date: departure.toISOString().slice(0, 10),
            departure_time: departure.toISOString().slice(11, 19),
            arrival_date: arrival.toISOString().slice(0, 10),
            arrival_time: arrival.toISOString().slice(11, 19),
            is_recurring: routeIndex === 0,
            recurring_days: routeIndex === 0 ? ["Monday", "Wednesday", "Friday"] : null,
            recurring_start_date: routeIndex === 0 ? departure.toISOString().slice(0, 10) : null,
            recurring_end_date: routeIndex === 0 ? plusDays(departure, 30).toISOString().slice(0, 10) : null,
            vehicle_type: traveller.vehicle_type || "bike",
            vehicle_number: traveller.vehicle_number || `MH${randomInt(10, 99)}${String(randomInt(1000, 9999))}`,
            transport_mode: routeIndex % 3 === 0 ? "private" : routeIndex % 3 === 1 ? "bus" : "train",
            stops_passed: routeIndex === 0 ? [origin.city, destination.city] : [origin.city],
            transit_details: routeIndex === 0 ? null : { service_name: `${origin.city} Express`, seat_numbers: ["12A", "12B"] },
            max_weight_kg: traveller.capacity_kg || 20,
            available_capacity_kg: traveller.capacity_kg || 20,
            accepted_parcel_types: ["small", "medium", "large"],
            min_earning_per_delivery: randomFloat(100, 800, 2),
            route_geometry: null,
            total_distance_km: randomFloat(40, 700, 2),
            total_duration_minutes: randomFloat(90, 900, 2),
            localities_passed: [origin.city, destination.city],
            pincodes_covered: [origin.pincode, destination.pincode],
            talukas_passed: [origin.taluka, destination.taluka],
            cities_passed: [origin.city, destination.city],
            landmarks_nearby: ["Bus Stand", "Railway Station"],
            route_geom: null,
            status: "ACTIVE",
          },
          departure
        )
      );
      routes.push(route);
    }
  }

  log(chalk.green(`✓ Traveller routes ready: ${routes.length}`));
  return routes;
}

async function seedRoutePlaces(routes, addresses) {
  const routePlacesTable = await getTableName(TABLE_ALIASES.route_places);
  if (!routePlacesTable) {
    log(chalk.yellow("⚠ route_places table not found, skipping route places"));
    return [];
  }

  const routePlaces = [];
  for (const [index, route] of routes.entries()) {
    const origin = addresses[index % addresses.length];
    const destination = addresses[(index + 1) % addresses.length];
    const places = [
      {
        route_id: route.id,
        place_id: `${route.id}-origin`,
        place_type: "city",
        place_name: origin.city,
        latitude: origin.latitude,
        longitude: origin.longitude,
        sequence_order: 0,
      },
      {
        route_id: route.id,
        place_id: `${route.id}-destination`,
        place_type: "city",
        place_name: destination.city,
        latitude: destination.latitude,
        longitude: destination.longitude,
        sequence_order: 1,
      },
    ];

    for (const place of places) {
      const existing = await selectOne(routePlacesTable, { route_id: place.route_id, sequence_order: place.sequence_order });
      if (existing) {
        routePlaces.push(existing);
        continue;
      }

      const createdAt = minutesAgo(300 + index * 4 + place.sequence_order);
      const inserted = await insertRow(
        routePlacesTable,
        applyTimestamps(routePlacesTable, place, createdAt)
      );
      routePlaces.push(inserted);
    }
  }

  log(chalk.green(`✓ Route places ready: ${routePlaces.length}`));
  return routePlaces;
}

async function seedParcels(users, addresses) {
  const parcelsTable = await getTableName(TABLE_ALIASES.parcels);
  if (!parcelsTable) {
    throw new Error("parcel table not found");
  }

  const senders = users.filter((user) => !TRAVELER_ROLE_REGEX.test(user.role_name));
  const parcelCount = Math.min(15, Math.max(10, senders.length * 2));
  const parcels = [];

  for (let index = 1; index <= parcelCount; index += 1) {
    const sender = senders[(index - 1) % senders.length] || users[(index - 1) % users.length];
    const pickup = addresses[(index - 1) % addresses.length];
    const delivery = addresses[(index + 3) % addresses.length];
    const createdAt = minutesAgo(500 + index * 11);
    const parcelRef = parcelReference(index);

    const parcel = await ensureRow(
      parcelsTable,
      { parcel_ref: parcelRef },
      applyTimestamps(
        parcelsTable,
        {
          user_id: sender.id,
          parcel_ref: parcelRef,
          package_size: pick(["small", "medium", "large", "extra_large"]),
          weight: randomFloat(0.5, 18, 2),
          length: randomFloat(10, 80, 2),
          width: randomFloat(10, 60, 2),
          height: randomFloat(5, 50, 2),
          description: `Sample parcel ${index} from ${pickup.city} to ${delivery.city}`,
          parcel_type: pick(["SHORT_DISTANCE", "LONG_DISTANCE"]),
          value: randomFloat(500, 25000, 2),
          notes: `Handle with care ${index}`,
          photos: [`https://example.com/assets/parcels/${index}.jpg`],
          pickup_address_id: pickup.id,
          delivery_address_id: delivery.id,
          selected_partner_id: null,
          price_quote: randomFloat(150, 1200, 2),
          form_step: 3,
          selected_acceptance_id: null,
          route_distance_km: randomFloat(20, 800, 2),
          route_duration_minutes: randomFloat(45, 900, 2),
          intermediate_cities: [pickup.city, delivery.city],
          route_geometry: null,
          status: pick(["CREATED", "MATCHING", "PARTNER_SELECTED", "CONFIRMED", "PICKUP", "IN_TRANSIT"]),
        },
        createdAt
      )
    );

    parcels.push({ ...parcel, sender, pickup, delivery });
  }

  log(chalk.green(`✓ Parcels ready: ${parcels.length}`));
  return parcels;
}

async function seedParcelRequestsAndAcceptances(parcels, routes, travellerProfiles) {
  const parcelRequestsTable = await getTableName(TABLE_ALIASES.parcel_requests);
  const parcelAcceptancesTable = await getTableName(TABLE_ALIASES.parcel_acceptances);
  if (!parcelRequestsTable || !parcelAcceptancesTable) {
    log(chalk.yellow("⚠ parcel request/acceptance tables not found, skipping matching data"));
    return { requests: [], acceptances: [] };
  }

  const requests = [];
  const acceptances = [];
  const activeRoutes = routes.length ? routes : [];

  for (let index = 0; index < parcels.length; index += 1) {
    const parcel = parcels[index];
    const travellerProfile = travellerProfiles[index % travellerProfiles.length];
    const travellerUser = travellerProfile?.user;
    const route = activeRoutes[index % activeRoutes.length];
    if (!travellerUser || !route) {
      continue;
    }

    const sentAt = minutesAgo(600 + index * 14);
    const requestRef = {
      parcel_id: parcel.id,
      traveller_id: travellerUser.id,
      route_id: route.id,
    };

    const request = await ensureRow(
      parcelRequestsTable,
      requestRef,
      applyTimestamps(
        parcelRequestsTable,
        {
          ...requestRef,
          match_score: randomFloat(65, 99, 2),
          detour_km: randomFloat(1, 25, 2),
          detour_percentage: randomFloat(2, 20, 2),
          status: pick(["SENT", "INTERESTED", "ACCEPTED", "REJECTED", "SELECTED", "NOT_SELECTED"]),
          sent_at: sentAt,
          expires_at: plusHours(sentAt, 12),
          responded_at: plusHours(sentAt, randomInt(1, 8)),
        },
        sentAt
      )
    );

    requests.push(request);

    const acceptance = await ensureRow(
      parcelAcceptancesTable,
      { parcel_request_id: request.id },
      applyTimestamps(
        parcelAcceptancesTable,
        {
          parcel_request_id: request.id,
          parcel_id: parcel.id,
          traveller_id: travellerUser.id,
          accepted_at: plusHours(sentAt, randomInt(1, 6)),
          acceptance_price: randomFloat(150, 1500, 2),
        },
        plusHours(sentAt, randomInt(1, 6))
      )
    );

    acceptances.push(acceptance);
  }

  log(chalk.green(`✓ Parcel requests ready: ${requests.length}`));
  log(chalk.green(`✓ Parcel acceptances ready: ${acceptances.length}`));
  return { requests, acceptances };
}

async function seedBookings(parcels, travellers) {
  const bookingsTable = await getTableName(TABLE_ALIASES.bookings);
  if (!bookingsTable) {
    throw new Error("booking table not found");
  }

  const bookingCount = Math.min(15, Math.max(10, parcels.length));
  const bookings = [];
  const statuses = ["CREATED", "MATCHING", "CONFIRMED", "IN_TRANSIT", "DELIVERED", "CANCELLED"];

  for (let index = 1; index <= bookingCount; index += 1) {
    const parcel = parcels[(index - 1) % parcels.length];
    const travellerProfile = travellers[(index - 1) % travellers.length];
    const travellerUser = travellerProfile?.user;
    const createdAt = minutesAgo(700 + index * 12);
    const bookingStatus = statuses[(index - 1) % statuses.length];
    const bookingRef = bookingReference(index);
    const trackingRef = `TRKBOOK${String(index).padStart(6, "0")}`;
    const deliveryRef = deliveryReference(index);
    const amount = Number((parcel.price_quote || randomFloat(200, 1500, 2)).toFixed(2));

    const booking = await ensureRow(
      bookingsTable,
      { booking_ref: bookingRef },
      applyTimestamps(
        bookingsTable,
        {
          parcel_id: parcel.id,
          traveller_id: travellerUser?.id || null,
          user_id: parcel.user_id,
          status: bookingStatus,
          assigned_date: createdAt,
          trip_id: null,
          booking_ref: bookingRef,
          tracking_ref: trackingRef,
          delivery_ref: deliveryRef,
          amount,
          pickup_otp: String(randomInt(1000, 9999)),
          delivery_otp: String(randomInt(1000, 9999)),
          pickup_otp_generated_at: plusHours(createdAt, 1),
          pickup_otp_attempts: randomInt(0, 2),
          pickup_verified_at: bookingStatus === "CONFIRMED" || bookingStatus === "IN_TRANSIT" || bookingStatus === "DELIVERED" ? plusHours(createdAt, 5) : null,
          delivery_otp_generated_at: bookingStatus === "IN_TRANSIT" || bookingStatus === "DELIVERED" ? plusHours(createdAt, 8) : null,
          delivery_otp_attempts: randomInt(0, 2),
          delivered_at: bookingStatus === "DELIVERED" ? plusHours(createdAt, randomInt(10, 24)) : null,
          pickup_otp_locked_until: null,
          delivery_otp_locked_until: null,
          payment_mode: index % 2 === 0 ? "PAY_NOW" : "PAY_AFTER_DELIVERY",
        },
        createdAt
      )
    );

    bookings.push({ ...booking, parcel, travellerProfile, travellerUser, amount });
  }

  log(chalk.green(`✓ Bookings ready: ${bookings.length}`));
  return bookings;
}

async function seedBookingLogs(bookings) {
  const logsTable = await getTableName(TABLE_ALIASES.booking_status_logs);
  if (!logsTable) {
    log(chalk.yellow("⚠ booking_status_logs table not found, skipping booking logs"));
    return [];
  }

  const statusesByBooking = {
    CREATED: ["CREATED"],
    MATCHING: ["CREATED", "MATCHING"],
    CONFIRMED: ["CREATED", "MATCHING", "CONFIRMED"],
    IN_TRANSIT: ["CREATED", "MATCHING", "CONFIRMED", "IN_TRANSIT"],
    DELIVERED: ["CREATED", "MATCHING", "CONFIRMED", "IN_TRANSIT", "DELIVERED"],
    CANCELLED: ["CREATED", "MATCHING", "CANCELLED"],
  };

  const inserted = [];
  for (const [index, booking] of bookings.entries()) {
    const statuses = statusesByBooking[booking.status] || ["CREATED"];
    for (const [step, status] of statuses.entries()) {
      const lookup = { booking_id: booking.id, status };
      const existing = await selectOne(logsTable, lookup);
      if (existing) {
        inserted.push(existing);
        continue;
      }

      const createdAt = minutesAgo(800 + index * 12 + step * 5);
      inserted.push(
        await insertRow(
          logsTable,
          applyTimestamps(
            logsTable,
            {
              booking_id: booking.id,
              status,
            },
            createdAt
          )
        )
      );
    }
  }

  log(chalk.green(`✓ Booking logs ready: ${inserted.length}`));
  return inserted;
}

async function seedTracking(bookings) {
  const trackingTable = await getTableName(TABLE_ALIASES.parcel_trackings);
  if (!trackingTable) {
    log(chalk.yellow("⚠ parcel_trackings table not found, skipping tracking"));
    return [];
  }

  const inserted = [];
  for (const [index, booking] of bookings.entries()) {
    const lookup = { booking_id: booking.id };
    const existing = await selectOne(trackingTable, lookup);
    if (existing) {
      inserted.push(existing);
      continue;
    }

    const pickup = booking.parcel.pickup_address_id ? booking.parcel : null;
    const createdAt = minutesAgo(900 + index * 10);
    inserted.push(
      await insertRow(
        trackingTable,
        applyTimestamps(
          trackingTable,
          {
            booking_id: booking.id,
            vehicle_type: pick(["car", "bike", "truck", "walk"]),
            pickup_lat: booking.parcel?.pickup_address_id ? randomFloat(18, 22, 7) : randomFloat(18, 22, 7),
            pickup_lng: randomFloat(72, 80, 7),
            delivery_lat: randomFloat(18, 22, 7),
            delivery_lng: randomFloat(72, 80, 7),
            encoded_polyline: null,
            distance_meters: randomInt(5000, 700000),
            duration_seconds: randomInt(1800, 28800),
            traveller_lat: randomFloat(18, 22, 7),
            traveller_lng: randomFloat(72, 80, 7),
            speed: randomFloat(0, 80, 2),
            heading: randomFloat(0, 360, 2),
            status: pick(["initiated", "picked_up", "in_transit", "delivered", "failed"]),
          },
          createdAt
        )
      )
    );
  }

  log(chalk.green(`✓ Parcel tracking rows ready: ${inserted.length}`));
  return inserted;
}

async function seedPendingPayments(bookings, travellers) {
  const pendingTable = await getTableName(TABLE_ALIASES.pending_payment);
  if (!pendingTable) {
    log(chalk.yellow("⚠ pending_payment table not found, skipping pending payments"));
    return [];
  }

  const inserted = [];
  for (const [index, booking] of bookings.entries()) {
    if (booking.payment_mode !== "PAY_AFTER_DELIVERY") {
      continue;
    }
    const travellerUser = booking.travellerUser;
    if (!travellerUser) {
      continue;
    }

    const lookup = { booking_id: booking.id };
    const existing = await selectOne(pendingTable, lookup);
    if (existing) {
      inserted.push(existing);
      continue;
    }

    const createdAt = minutesAgo(650 + index * 9);
    inserted.push(
      await insertRow(
        pendingTable,
        applyTimestamps(
          pendingTable,
          {
            booking_id: booking.id,
            traveller_id: travellerUser.id,
            amount: booking.amount,
            status: pick(["PENDING_RECEIPT", "RECEIVED"]),
            delivery_ref: booking.delivery_ref,
            received_at: plusHours(createdAt, 5),
            withdrawn_at: null,
          },
          createdAt
        )
      )
    );
  }

  log(chalk.green(`✓ Pending payments ready: ${inserted.length}`));
  return inserted;
}

async function seedPayments(bookings) {
  const paymentsTable = await getTableName(TABLE_ALIASES.payments);
  if (!paymentsTable) {
    log(chalk.yellow("⚠ payments table not found, skipping payments"));
    return [];
  }

  const inserted = [];
  for (const [index, booking] of bookings.entries()) {
    const lookup = { booking_id: booking.id };
    const existing = await selectOne(paymentsTable, lookup);
    if (existing) {
      inserted.push(existing);
      continue;
    }

    const createdAt = minutesAgo(720 + index * 15);
    const status = booking.status === "DELIVERED"
      ? "SUCCESS"
      : booking.status === "CANCELLED"
        ? "REFUNDED"
        : index % 3 === 0
          ? "FAILED"
          : "PENDING";

    inserted.push(
      await insertRow(
        paymentsTable,
        applyTimestamps(
          paymentsTable,
          {
            parcel_id: booking.parcel.id,
            booking_id: booking.id,
            amount: booking.amount,
            currency: "INR",
            razorpay_order_id: `order_${paymentReference(index + 1)}`,
            razorpay_payment_id: status === "SUCCESS" ? `pay_${paymentReference(index + 1)}` : null,
            razorpay_signature: status === "SUCCESS" ? `sig_${paymentReference(index + 1)}` : null,
            status,
            released_at: status === "SUCCESS" ? plusHours(createdAt, 6) : null,
          },
          createdAt
        )
      )
    );
  }

  log(chalk.green(`✓ Payments ready: ${inserted.length}`));
  return inserted;
}

async function seedWalletTransactions(wallets, bookings) {
  const walletTransactionsTable = await getTableName(TABLE_ALIASES.wallet_transactions);
  if (!walletTransactionsTable) {
    log(chalk.yellow("⚠ wallet_transactions table not found, skipping wallet transactions"));
    return [];
  }

  const inserted = [];
  for (const [index, booking] of bookings.entries()) {
    if (booking.status !== "DELIVERED") {
      continue;
    }

    const wallet = wallets.find((w) => w.user_id === booking.travellerUser?.id);
    if (!wallet) {
      continue;
    }

    const lookup = { wallet_id: wallet.id, reason: `Booking ${booking.booking_ref}` };
    const existing = await selectOne(walletTransactionsTable, lookup);
    if (existing) {
      inserted.push(existing);
      continue;
    }

    const createdAt = minutesAgo(730 + index * 7);
    inserted.push(
      await insertRow(
        walletTransactionsTable,
        applyTimestamps(
          walletTransactionsTable,
          {
            wallet_id: wallet.id,
            type: "CREDIT",
            amount: booking.amount,
            reason: `Delivery payout for ${booking.booking_ref}`,
          },
          createdAt
        )
      )
    );
  }

  log(chalk.green(`✓ Wallet transactions ready: ${inserted.length}`));
  return inserted;
}

async function seedFeedbacks(bookings) {
  const feedbacksTable = await getTableName(TABLE_ALIASES.feedbacks);
  if (!feedbacksTable) {
    log(chalk.yellow("⚠ feedbacks table not found, skipping feedbacks"));
    return [];
  }

  const inserted = [];
  for (const [index, booking] of bookings.entries()) {
    if (booking.status !== "DELIVERED") {
      continue;
    }

    const travellerProfile = booking.travellerProfile;
    if (!travellerProfile) {
      continue;
    }

    const lookup = { booking_id: booking.id };
    const existing = await selectOne(feedbacksTable, lookup);
    if (existing) {
      inserted.push(existing);
      continue;
    }

    const createdAt = minutesAgo(760 + index * 5);
    inserted.push(
      await insertRow(
        feedbacksTable,
        applyTimestamps(
          feedbacksTable,
          {
            booking_id: booking.id,
            parcel_id: booking.parcel.id,
            user_id: booking.user_id,
            traveller_id: travellerProfile.id,
            rating: randomInt(4, 5),
            tags: ["on_time", "careful", "polite"],
            comment: `Great delivery experience for ${booking.booking_ref}.`,
          },
          createdAt
        )
      )
    );
  }

  log(chalk.green(`✓ Feedback rows ready: ${inserted.length}`));
  return inserted;
}

async function seedDisputes(bookings) {
  const disputesTable = await getTableName(TABLE_ALIASES.disputes);
  if (!disputesTable) {
    log(chalk.yellow("⚠ disputes table not found, skipping disputes"));
    return [];
  }

  const inserted = [];
  const targetBookings = bookings.filter((booking) => booking.status === "CANCELLED" || booking.status === "IN_TRANSIT").slice(0, 3);
  for (const [index, booking] of targetBookings.entries()) {
    const sender = booking.user_id;
    const traveller = booking.travellerUser?.id || booking.user_id;
    const raisedBy = index % 2 === 0 ? sender : traveller;
    const role = index % 2 === 0 ? "USER" : "TRAVELLER";
    const lookup = { booking_id: booking.id, raised_by: raisedBy };
    const existing = await selectOne(disputesTable, lookup);
    if (existing) {
      inserted.push(existing);
      continue;
    }

    const createdAt = minutesAgo(820 + index * 12);
    inserted.push(
      await insertRow(
        disputesTable,
        applyTimestamps(
          disputesTable,
          {
            booking_id: booking.id,
            raised_by: raisedBy,
            role,
            dispute_type: pick(["damaged_item", "late_delivery", "recipient_unavailable", "wrong_address"]),
            description: `Sample dispute for booking ${booking.booking_ref}`,
            status: pick(["OPEN", "IN_PROGRESS", "RESOLVED"]),
          },
          createdAt
        )
      )
    );
  }

  log(chalk.green(`✓ Disputes ready: ${inserted.length}`));
  return inserted;
}

async function seedChatMessages(bookings) {
  const messagesTable = await getTableName(TABLE_ALIASES.chat_messages);
  if (!messagesTable) {
    log(chalk.yellow("⚠ chat_messages table not found, skipping messages"));
    return [];
  }

  const inserted = [];
  for (const [index, booking] of bookings.entries()) {
    const travellers = booking.travellerUser;
    if (!travellers) {
      continue;
    }

    const messagePairs = [
      {
        sender_id: booking.user_id,
        sender_role: "user",
        message: `Hi, is ${booking.booking_ref} on the way?`,
      },
      {
        sender_id: travellers.id,
        sender_role: "traveller",
        message: `Yes, I will pick it up shortly.`,
      },
    ];

    for (const [messageIndex, message] of messagePairs.entries()) {
      const lookup = { booking_id: booking.id, sender_id: message.sender_id, message: message.message };
      const existing = await selectOne(messagesTable, lookup);
      if (existing) {
        inserted.push(existing);
        continue;
      }

      const createdAt = minutesAgo(850 + index * 6 + messageIndex * 2);
      inserted.push(
        await insertRow(
          messagesTable,
          applyTimestamps(
            messagesTable,
            {
              booking_id: booking.id,
              sender_id: message.sender_id,
              sender_role: message.sender_role,
              message: message.message,
              is_read: messageIndex === 0,
            },
            createdAt
          )
        )
      );
    }
  }

  log(chalk.green(`✓ Chat messages ready: ${inserted.length}`));
  return inserted;
}

async function seedDeliveryAttempts(bookings) {
  const attemptsTable = await getTableName(TABLE_ALIASES.delivery_attempts);
  if (!attemptsTable) {
    log(chalk.yellow("⚠ delivery_attempts table not found, skipping delivery attempts"));
    return [];
  }

  const inserted = [];
  const targetBookings = bookings.filter((booking) => booking.status !== "DELIVERED").slice(0, 4);
  for (const [index, booking] of targetBookings.entries()) {
    const traveller = booking.travellerUser;
    if (!traveller) {
      continue;
    }

    const lookup = { booking_id: booking.id, attempt_number: 1 };
    const existing = await selectOne(attemptsTable, lookup);
    if (existing) {
      inserted.push(existing);
      continue;
    }

    const createdAt = minutesAgo(870 + index * 7);
    inserted.push(
      await insertRow(
        attemptsTable,
        applyTimestamps(
          attemptsTable,
          {
            booking_id: booking.id,
            traveller_id: traveller.id,
            attempt_number: 1,
            reason: pick(["recipient_unavailable", "wrong_address", "access_denied", "recipient_refused", "other"]),
            notes: `Attempted delivery for ${booking.booking_ref}`,
            photo_url: `https://example.com/assets/attempts/${index + 1}.jpg`,
            rescheduled_at: plusHours(createdAt, 6),
            attempted_at: createdAt,
          },
          createdAt
        )
      )
    );
  }

  log(chalk.green(`✓ Delivery attempts ready: ${inserted.length}`));
  return inserted;
}

async function seedNotifications(users) {
  const notificationsTable = await getTableName(TABLE_ALIASES.notifications);
  if (!notificationsTable) {
    log(chalk.yellow("⚠ notifications table not found, skipping notifications"));
    return [];
  }

  const inserted = [];
  const messages = [
    { type_code: "BOOKING_CREATED", title: "Booking created", message: "Your parcel booking has been created." },
    { type_code: "BOOKING_CONFIRMED", title: "Booking confirmed", message: "A traveller has confirmed the delivery." },
    { type_code: "PAYMENT_SUCCESS", title: "Payment received", message: "Payment was successfully completed." },
    { type_code: "DELIVERY_UPDATE", title: "Delivery update", message: "Your parcel is now in transit." },
    { type_code: "FEEDBACK_REMINDER", title: "Rate your trip", message: "Please rate your delivery experience." },
  ];

  for (let index = 0; index < Math.min(20, users.length * 2); index += 1) {
    const user = users[index % users.length];
    const message = messages[index % messages.length];
    const lookup = { user_id: user.id, type_code: message.type_code, title: message.title };
    const existing = await selectOne(notificationsTable, lookup);
    if (existing) {
      inserted.push(existing);
      continue;
    }

    const createdAt = minutesAgo(950 + index * 3);
    inserted.push(
      await insertRow(
        notificationsTable,
        applyTimestamps(
          notificationsTable,
          {
            user_id: user.id,
            role: TRAVELER_ROLE_REGEX.test(user.role_name) ? "traveller" : "user",
            type_code: message.type_code,
            title: message.title,
            message: `${message.message} (${user.role_name})`,
            is_read: index % 3 === 0,
            meta: { seed: true, role: user.role_name, index },
          },
          createdAt
        )
      )
    );
  }

  log(chalk.green(`✓ Notifications ready: ${inserted.length}`));
  return inserted;
}

async function seedUserDeviceTokens(users) {
  const tokensTable = await getTableName(TABLE_ALIASES.user_device_tokens);
  if (!tokensTable) {
    return [];
  }

  const inserted = [];
  for (const [index, user] of users.entries()) {
    const token = `seed-token-${slugify(user.role_name)}-${index + 1}`;
    const existing = await selectOne(tokensTable, { token });
    if (existing) {
      inserted.push(existing);
      continue;
    }

    const createdAt = minutesAgo(1000 + index * 2);
    inserted.push(
      await insertRow(
        tokensTable,
        applyTimestamps(
          tokensTable,
          {
            user_id: user.id,
            token,
            device_type: index % 2 === 0 ? "mobile" : "web",
          },
          createdAt
        )
      )
    );
  }

  log(chalk.green(`✓ Device tokens ready: ${inserted.length}`));
  return inserted;
}

async function seedReferrals(users) {
  const referralsTable = await getTableName(TABLE_ALIASES.referrals);
  if (!referralsTable) {
    return [];
  }

  const inserted = [];
  const referrers = users.slice(0, Math.min(3, users.length));
  const referred = users.slice(3, Math.min(8, users.length));

  for (const [index, user] of referred.entries()) {
    const referrer = referrers[index % referrers.length];
    const lookup = { referred_id: user.id };
    const existing = await selectOne(referralsTable, lookup);
    if (existing) {
      inserted.push(existing);
      continue;
    }

    const createdAt = minutesAgo(1050 + index * 4);
    inserted.push(
      await insertRow(
        referralsTable,
        applyTimestamps(
          referralsTable,
          {
            referrer_id: referrer.id,
            referred_id: user.id,
            referral_code: referralCodeFor(index + 1),
            status: pick(["PENDING", "CREDITED", "EXPIRED"]),
            referrer_credit: 50,
            referred_credit: 30,
            credited_at: index % 2 === 0 ? plusDays(createdAt, 2) : null,
          },
          createdAt
        )
      )
    );
  }

  log(chalk.green(`✓ Referrals ready: ${inserted.length}`));
  return inserted;
}

async function seedRefunds(payments) {
  const refundsTable = await getTableName(TABLE_ALIASES.refunds);
  if (!refundsTable) {
    return [];
  }

  const inserted = [];
  const refundTargets = payments.filter((payment) => payment.status === "FAILED" || payment.status === "REFUNDED").slice(0, 3);
  for (const [index, payment] of refundTargets.entries()) {
    const lookup = { payment_id: payment.id };
    const existing = await selectOne(refundsTable, lookup);
    if (existing) {
      inserted.push(existing);
      continue;
    }

    const createdAt = minutesAgo(1100 + index * 5);
    inserted.push(
      await insertRow(
        refundsTable,
        applyTimestamps(
          refundsTable,
          {
            payment_id: payment.id,
            amount: payment.amount,
            status: pick(["REQUESTED", "COMPLETED"]),
          },
          createdAt
        )
      )
    );
  }

  log(chalk.green(`✓ Refunds ready: ${inserted.length}`));
  return inserted;
}

async function main() {
  try {
    log(chalk.cyan("\n📦 Seeding development data...\n"));
    await sequelize.authenticate();

    const { roles } = await seedRoles();
    const { users } = await seedUsersAndRoles(roles);
    await seedProfiles(users);
    const travellerProfiles = await seedTravellerProfiles(users);
    const wallets = await seedWallets(users);
    const addresses = await seedAddresses();
    const routes = await seedTravellerRoutes(travellerProfiles, addresses);
    await seedRoutePlaces(routes, addresses);
    const parcels = await seedParcels(users, addresses);
    await seedParcelRequestsAndAcceptances(parcels, routes, travellerProfiles);
    const bookings = await seedBookings(parcels, travellerProfiles);
    const bookingLogs = await seedBookingLogs(bookings);
    await seedTracking(bookings);
    await seedPendingPayments(bookings, travellerProfiles);
    const payments = await seedPayments(bookings);
    await seedWalletTransactions(wallets, bookings);
    await seedFeedbacks(bookings);
    await seedDisputes(bookings);
    await seedChatMessages(bookings);
    await seedDeliveryAttempts(bookings);
    await seedNotifications(users);
    await seedUserDeviceTokens(users);
    await seedReferrals(users);
    await seedRefunds(payments);

    log(chalk.green("\n✅ Seed complete."));
    log(chalk.green(`   Users: ${users.length}`));
    log(chalk.green(`   Bookings: ${bookings.length}`));
    log(chalk.green(`   Booking logs: ${bookingLogs.length}`));
    log(chalk.green(`   Payments: ${payments.length}`));
  } catch (error) {
    console.error(chalk.red("\n❌ Seed failed:"));
    console.error(error);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

main();
