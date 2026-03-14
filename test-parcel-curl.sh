#!/bin/bash

# Test Parcel Creation with Geocoding
# Make sure your server is running on http://localhost:3000

echo "🧪 Testing Parcel Creation with Geocoding"
echo "=========================================="
echo ""

# Step 1: Login to get token
echo "1️⃣  Logging in..."
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test@123",
    "role": "INDIVIDUAL"
  }')

TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "❌ Login failed. Response:"
  echo "$LOGIN_RESPONSE"
  echo ""
  echo "Try signup first:"
  echo "curl -X POST http://localhost:3000/api/auth/signup \\"
  echo "  -H 'Content-Type: application/json' \\"
  echo "  -d '{\"email\":\"test@example.com\",\"password\":\"Test@123\",\"phone_number\":\"+919999999999\",\"name\":\"Test User\"}'"
  exit 1
fi

echo "✅ Logged in successfully"
echo "Token: ${TOKEN:0:20}..."
echo ""

# Step 2: Create parcel
echo "2️⃣  Creating parcel with geocoding..."
echo "📍 Pickup: Gateway of India, Mumbai"
echo "📍 Delivery: India Gate, New Delhi"
echo ""

PARCEL_RESPONSE=$(curl -s -X POST http://localhost:3000/api/parcel/request \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "package_size": "medium",
    "delivery_speed": "standard",
    "weight": 2.5,
    "description": "Test parcel for geocoding",
    "parcel_type": "Electronics",
    "value": 5000,
    "pickup_address": {
      "name": "Sender Name",
      "address": "Gateway of India, Apollo Bandar",
      "city": "Mumbai",
      "state": "Maharashtra",
      "pincode": "400001",
      "country": "India",
      "phone": "+919876543210"
    },
    "delivery_address": {
      "name": "Receiver Name",
      "address": "India Gate, Rajpath",
      "city": "New Delhi",
      "state": "Delhi",
      "pincode": "110001",
      "country": "India",
      "phone": "+919876543211"
    }
  }')

echo "Response:"
echo "$PARCEL_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$PARCEL_RESPONSE"
echo ""

# Check if geocoding worked
if echo "$PARCEL_RESPONSE" | grep -q '"place_id"'; then
  echo "✅ Geocoding is working!"
  echo ""
  echo "Check these fields in the response:"
  echo "  - pickupAddress.place_id"
  echo "  - pickupAddress.latitude"
  echo "  - pickupAddress.longitude"
  echo "  - deliveryAddress.place_id"
  echo "  - parcel.route_distance_km"
  echo "  - parcel.route_duration_minutes"
else
  echo "⚠️  Geocoding may not be working"
  echo "Check GOOGLE_API_KEY in .env"
fi
