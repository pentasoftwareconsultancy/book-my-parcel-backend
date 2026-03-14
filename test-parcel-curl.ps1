# Test Parcel Creation with Geocoding (PowerShell)
# Make sure your server is running on http://localhost:3000

Write-Host "`n🧪 Testing Parcel Creation with Geocoding" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

$baseUrl = "http://localhost:3000/api"

# Step 1: Login to get token
Write-Host "1️⃣  Logging in..." -ForegroundColor Yellow

$loginBody = @{
    email = "test@example.com"
    password = "Test@123"
    role = "INDIVIDUAL"
} | ConvertTo-Json

try {
    $loginResponse = Invoke-RestMethod -Uri "$baseUrl/auth/login" `
        -Method Post `
        -ContentType "application/json" `
        -Body $loginBody `
        -ErrorAction Stop

    $token = $loginResponse.data.token
    Write-Host "✅ Logged in successfully" -ForegroundColor Green
    Write-Host "Token: $($token.Substring(0, 20))..." -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "❌ Login failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Try signup first:" -ForegroundColor Yellow
    Write-Host 'Invoke-RestMethod -Uri "http://localhost:3000/api/auth/signup" -Method Post -ContentType "application/json" -Body ''{"email":"test@example.com","password":"Test@123","phone_number":"+919999999999","name":"Test User"}''' -ForegroundColor Gray
    exit 1
}

# Step 2: Create parcel
Write-Host "2️⃣  Creating parcel with geocoding..." -ForegroundColor Yellow
Write-Host "📍 Pickup: Gateway of India, Mumbai" -ForegroundColor Gray
Write-Host "📍 Delivery: India Gate, New Delhi" -ForegroundColor Gray
Write-Host ""

$parcelBody = @{
    package_size = "medium"
    delivery_speed = "standard"
    weight = 2.5
    description = "Test parcel for geocoding"
    parcel_type = "Electronics"
    value = 5000
    pickup_address = @{
        name = "Sender Name"
        address = "Gateway of India, Apollo Bandar"
        city = "Mumbai"
        state = "Maharashtra"
        pincode = "400001"
        country = "India"
        phone = "+919876543210"
    }
    delivery_address = @{
        name = "Receiver Name"
        address = "India Gate, Rajpath"
        city = "New Delhi"
        state = "Delhi"
        pincode = "110001"
        country = "India"
        phone = "+919876543211"
    }
} | ConvertTo-Json -Depth 10

try {
    $parcelResponse = Invoke-RestMethod -Uri "$baseUrl/parcel/request" `
        -Method Post `
        -Headers @{
            "Authorization" = "Bearer $token"
            "Content-Type" = "application/json"
        } `
        -Body $parcelBody `
        -ErrorAction Stop

    Write-Host "✅ Parcel created successfully!" -ForegroundColor Green
    Write-Host ""
    
    # Display results
    $pickup = $parcelResponse.data.pickupAddress
    $delivery = $parcelResponse.data.deliveryAddress
    $parcel = $parcelResponse.data.parcel

    Write-Host "📦 PARCEL DETAILS:" -ForegroundColor Cyan
    Write-Host "   Parcel Ref: $($parcel.parcel_ref)" -ForegroundColor White
    Write-Host "   Status: $($parcel.status)" -ForegroundColor White
    Write-Host ""

    Write-Host "📍 PICKUP ADDRESS (Mumbai):" -ForegroundColor Cyan
    Write-Host "   City: $($pickup.city)" -ForegroundColor White
    Write-Host "   Place ID: $(if ($pickup.place_id) { $pickup.place_id } else { '❌ NOT GEOCODED' })" -ForegroundColor $(if ($pickup.place_id) { 'Green' } else { 'Red' })
    Write-Host "   Coordinates: $($pickup.latitude), $($pickup.longitude)" -ForegroundColor White
    Write-Host "   Validation: $(if ($pickup.validation_status) { $pickup.validation_status } else { 'N/A' })" -ForegroundColor White
    Write-Host "   District: $(if ($pickup.district) { $pickup.district } else { 'N/A' })" -ForegroundColor White
    Write-Host "   Locality: $(if ($pickup.locality) { $pickup.locality } else { 'N/A' })" -ForegroundColor White
    Write-Host ""

    Write-Host "📍 DELIVERY ADDRESS (Delhi):" -ForegroundColor Cyan
    Write-Host "   City: $($delivery.city)" -ForegroundColor White
    Write-Host "   Place ID: $(if ($delivery.place_id) { $delivery.place_id } else { '❌ NOT GEOCODED' })" -ForegroundColor $(if ($delivery.place_id) { 'Green' } else { 'Red' })
    Write-Host "   Coordinates: $($delivery.latitude), $($delivery.longitude)" -ForegroundColor White
    Write-Host "   Validation: $(if ($delivery.validation_status) { $delivery.validation_status } else { 'N/A' })" -ForegroundColor White
    Write-Host "   District: $(if ($delivery.district) { $delivery.district } else { 'N/A' })" -ForegroundColor White
    Write-Host "   Locality: $(if ($delivery.locality) { $delivery.locality } else { 'N/A' })" -ForegroundColor White
    Write-Host ""

    Write-Host "🚗 ROUTE DATA:" -ForegroundColor Cyan
    Write-Host "   Distance: $(if ($parcel.route_distance_km) { "$($parcel.route_distance_km) km" } else { '❌ NOT CALCULATED' })" -ForegroundColor $(if ($parcel.route_distance_km) { 'Green' } else { 'Red' })
    Write-Host "   Duration: $(if ($parcel.route_duration_minutes) { "$($parcel.route_duration_minutes) minutes" } else { '❌ NOT CALCULATED' })" -ForegroundColor $(if ($parcel.route_duration_minutes) { 'Green' } else { 'Red' })
    if ($parcel.intermediate_cities -and $parcel.intermediate_cities.Count -gt 0) {
        Write-Host "   Intermediate Cities: $($parcel.intermediate_cities -join ', ')" -ForegroundColor White
    }
    Write-Host ""

    # Verification
    $pickupGeocoded = $pickup.place_id -and $pickup.latitude -and $pickup.longitude
    $deliveryGeocoded = $delivery.place_id -and $delivery.latitude -and $delivery.longitude
    $routeCalculated = $parcel.route_distance_km -and $parcel.route_duration_minutes

    Write-Host "📊 VERIFICATION:" -ForegroundColor Cyan
    Write-Host "   Pickup Geocoded: $(if ($pickupGeocoded) { '✅ YES' } else { '❌ NO' })" -ForegroundColor $(if ($pickupGeocoded) { 'Green' } else { 'Red' })
    Write-Host "   Delivery Geocoded: $(if ($deliveryGeocoded) { '✅ YES' } else { '❌ NO' })" -ForegroundColor $(if ($deliveryGeocoded) { 'Green' } else { 'Red' })
    Write-Host "   Route Calculated: $(if ($routeCalculated) { '✅ YES' } else { '❌ NO' })" -ForegroundColor $(if ($routeCalculated) { 'Green' } else { 'Red' })
    Write-Host ""

    if ($pickupGeocoded -and $deliveryGeocoded -and $routeCalculated) {
        Write-Host "🎉 GEOCODING FULLY WORKING!" -ForegroundColor Green
    } else {
        Write-Host "⚠️  GEOCODING PARTIALLY WORKING" -ForegroundColor Yellow
        Write-Host "   Check GOOGLE_API_KEY in .env" -ForegroundColor Gray
        Write-Host "   Ensure all Google APIs are enabled" -ForegroundColor Gray
    }
    Write-Host ""

} catch {
    Write-Host "❌ Parcel creation failed:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host $_.ErrorDetails.Message -ForegroundColor Red
    }
}
