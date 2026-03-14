# Phase 1 Verification Guide

## Quick Start

### 1. Run Verification
```bash
npm run verify
```

### 2. If Issues Found, Run Fixes
```bash
npm run fix
```

### 3. Verify Again
```bash
npm run verify
```

---

## What Gets Checked

### ✅ Database Connection
- Verifies PostgreSQL connection

### ✅ Address Table Columns (13 new)
- place_id, latitude, longitude, plus_code
- validation_status, district, taluka, locality
- landmarks, sub_localities, formatted_address
- last_geocoded_at, usage_count

### ✅ Parcel Table Columns (4 new)
- route_distance_km, route_duration_minutes
- intermediate_cities, route_geometry

### ✅ Duplicate place_id Check
- Ensures unique constraint can be applied

### ✅ Database Indexes
- idx_address_place_id
- idx_address_coordinates
- idx_address_city_locality

### ✅ Google API Key
- Validates key exists and is not placeholder
- Tests Geocoding API
- Tests Places Autocomplete API

### ✅ CORS Configuration
- Checks for common CORS issues

---

## Manual SQL Checks

### Check Address Columns
```sql
SELECT place_id, latitude, longitude, plus_code, validation_status,
       district, taluka, locality, landmarks, sub_localities,
       formatted_address, last_geocoded_at, usage_count
FROM address LIMIT 1;
```

### Check Parcel Columns
```sql
SELECT route_distance_km, route_duration_minutes, 
       intermediate_cities, parcel_type, route_geometry
FROM parcel LIMIT 1;
```

### Check for Duplicates
```sql
SELECT place_id, COUNT(*) 
FROM address
WHERE place_id IS NOT NULL
GROUP BY place_id 
HAVING COUNT(*) > 1;
```

---

## Common Issues & Fixes

### Issue: Missing Columns
**Fix:** Run `npm run fix` or restart server with `alter: true` in database config

### Issue: Duplicate place_id
**Fix:** Run `npm run fix` to auto-resolve duplicates

### Issue: Google API Not Working
**Fix:** 
1. Check .env has valid GOOGLE_API_KEY
2. Enable required APIs in Google Cloud Console:
   - Geocoding API
   - Places API (New)
   - Routes API
   - Address Validation API

### Issue: CORS Errors
**Fix:** Ensure origins in server.js don't include paths
- ✅ `https://example.com`
- ❌ `https://example.com/api`

---

## Environment Variables Required

```env
GOOGLE_API_KEY=your_actual_api_key_here
```

---

## Success Criteria

All checks should show ✅:
- Database connected
- All columns exist
- No duplicate place_ids
- Indexes created
- Google API working
- CORS configured correctly
