# Google API Keys Setup Guide

## Overview

The parcel creation feature uses **two separate API keys** for better security and quota management:

1. **Main API Key** - For Geocoding, Places, and Routes APIs
2. **Validation API Key** - For Address Validation API (optional)

---

## Why Separate Keys?

### Benefits:
- **Security**: Restrict each key to only necessary APIs
- **Quota Management**: Separate quotas for different services
- **Cost Control**: Track usage per service
- **Flexibility**: Disable validation without affecting core features

---

## API Key Configuration

### 1. Main API Key (Required)

**Environment Variable:** `GOOGLE_API_KEY`

**Required APIs:**
- ✅ Geocoding API
- ✅ Places API (New)
- ✅ Routes API

**Usage:**
- Convert addresses to coordinates
- Extract place IDs for caching
- Get administrative hierarchy
- Calculate routes and distances
- Place autocomplete

**Setup:**
```env
GOOGLE_API_KEY=AIzaSyAm1DQBV4ogUx1pyRy5Qk6okeoZNmtbwHY
```

### 2. Validation API Key (Optional)

**Environment Variable:** `GOOGLE_ADDRESS_VALIDATION_API_KEY`

**Required APIs:**
- ✅ Address Validation API

**Usage:**
- Validate address accuracy
- Get validation granularity (PREMISE, ROUTE, BLOCK)
- Set validation_status field (VALID, PARTIAL, INFERRED)

**Setup:**
```env
GOOGLE_ADDRESS_VALIDATION_API_KEY=your_address_validation_api_key_here
```

**Note:** If not configured, address validation is skipped gracefully. Core functionality still works.

---

## Creating API Keys in Google Cloud Console

### Step 1: Create Main API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project
3. Navigate to **APIs & Services > Credentials**
4. Click **Create Credentials > API Key**
5. Copy the key and save it as `GOOGLE_API_KEY`

### Step 2: Restrict Main API Key

1. Click on the created API key
2. Under **API restrictions**, select **Restrict key**
3. Enable these APIs:
   - Geocoding API
   - Places API (New)
   - Routes API
4. Save changes

### Step 3: Create Validation API Key (Optional)

1. Click **Create Credentials > API Key** again
2. Copy the key and save it as `GOOGLE_ADDRESS_VALIDATION_API_KEY`

### Step 4: Restrict Validation API Key

1. Click on the validation API key
2. Under **API restrictions**, select **Restrict key**
3. Enable only:
   - Address Validation API
4. Save changes

---

## Environment Variables

Add to your `.env` file:

```env
# Main API Key (Required)
GOOGLE_API_KEY=AIzaSyAm1DQBV4ogUx1pyRy5Qk6okeoZNmtbwHY

# Validation API Key (Optional)
GOOGLE_ADDRESS_VALIDATION_API_KEY=your_address_validation_api_key_here
```

---

## Fallback Behavior

### If Validation Key Not Configured:

```javascript
// System automatically falls back to main key
const GOOGLE_ADDRESS_VALIDATION_API_KEY = 
  process.env.GOOGLE_ADDRESS_VALIDATION_API_KEY || GOOGLE_API_KEY;
```

### If Validation Key is Placeholder:

```javascript
// System skips validation gracefully
if (validationKey === 'your_address_validation_api_key_here') {
  console.warn('Address validation skipped: No separate API key configured');
  // Continue with geocoding and other features
}
```

---

## Testing API Keys

### Test Main API Key:
```bash
npm run test:geocoding
```

Expected output:
```
✅ Geocoding API working
✅ Places Autocomplete API working
✅ Route Computation working
```

### Test Validation API Key:
```bash
npm run test:geocoding
```

Expected output:
```
✅ Address Validation API working
✅ Validation Verdict Present
✅ Granularity Level: PREMISE
```

---

## API Usage in Code

### Main API Key Usage:

```javascript
// Geocoding
const result = await geocodeAddress(addressString);

// Places
const details = await getPlaceDetails(placeId);

// Routes
const route = await computeRoute(origin, destination);
```

### Validation API Key Usage:

```javascript
// Address Validation (uses separate key)
const validation = await validateAddress(addressLine);
```

---

## Quota Management

### Recommended Quotas:

| API | Requests/Day | Cost per 1000 |
|-----|--------------|---------------|
| Geocoding | 40,000 | $5.00 |
| Places Autocomplete | 100,000 | $2.83 |
| Routes | 40,000 | $5.00 |
| Address Validation | 10,000 | $5.00 |

### Optimization:
- ✅ Address caching by place_id reduces API calls
- ✅ Validation is optional and skipped if key not configured
- ✅ All API calls outside database transactions

---

## Security Best Practices

### 1. API Key Restrictions
- ✅ Restrict by API (not all APIs enabled)
- ✅ Restrict by IP (if using from fixed servers)
- ✅ Restrict by HTTP referrer (for frontend keys)

### 2. Environment Variables
- ✅ Never commit .env to git
- ✅ Use different keys for dev/staging/production
- ✅ Rotate keys periodically

### 3. Monitoring
- ✅ Set up billing alerts
- ✅ Monitor API usage in Google Cloud Console
- ✅ Review logs for unusual activity

---

## Troubleshooting

### Error: "REQUEST_DENIED"
**Cause:** API not enabled for the key
**Fix:** Enable the required API in Google Cloud Console

### Error: "OVER_QUERY_LIMIT"
**Cause:** Exceeded daily quota
**Fix:** Increase quota or implement rate limiting

### Error: "INVALID_REQUEST"
**Cause:** Invalid parameters or missing data
**Fix:** Check request format and required fields

### Validation Skipped
**Cause:** Validation key not configured
**Impact:** None - core features still work
**Fix:** Add GOOGLE_ADDRESS_VALIDATION_API_KEY to .env (optional)

---

## Summary

✅ **Main API Key**: Required for core functionality
⚠️ **Validation API Key**: Optional for enhanced validation

Both keys work together to provide:
- Address geocoding and caching
- Route calculation
- Administrative hierarchy extraction
- Optional address validation

The system gracefully handles missing validation key while maintaining full core functionality.
