# Book My Parcel - Backend API

A comprehensive logistics platform backend that connects parcel senders with travelers, enabling cost-effective parcel delivery through shared travel routes.

## 🚀 Features

### Core Functionality
- **User Authentication & Authorization** - JWT-based auth with role-based access control
- **Parcel Management** - Complete parcel lifecycle with status tracking
- **Traveller Route Management** - Advanced route creation with spatial geometry
- **Intelligent Matching Engine** - 5-stage matching algorithm with spatial optimization
- **Real-time Notifications** - WebSocket integration with FCM push notifications
- **Address Enrichment** - Google Maps API integration with caching
- **Booking & OTP System** - Complete booking workflow with verification

### Advanced Features
- **PostGIS Spatial Queries** - Advanced spatial matching and route optimization
- **Multi-stage Matching Algorithm** - Geographic, temporal, capacity, and detour-based matching
- **Real-time WebSocket Communication** - Live updates for requests and acceptances
- **Address Caching & Deduplication** - Intelligent address management with place_id
- **Route Geometry Processing** - Polyline encoding/decoding with PostGIS conversion
- **Comprehensive API Documentation** - RESTful APIs with proper error handling

## 🛠 Tech Stack

- **Runtime:** Node.js with Express.js
- **Database:** PostgreSQL with PostGIS extension
- **ORM:** Sequelize with spatial support
- **Authentication:** JWT with bcrypt
- **Real-time:** Socket.io
- **File Upload:** Multer
- **External APIs:** Google Maps (Geocoding, Routes, Places, Address Validation)
- **Spatial Processing:** PostGIS, @mapbox/polyline

## 📋 Prerequisites

- Node.js (v16 or higher)
- PostgreSQL (v12 or higher)
- PostGIS extension
- Google Maps API keys

## 🚀 Quick Start

### 1. Installation

```bash
# Clone the repository
git clone <repository-url>
cd backend

# Install dependencies
npm install
```

### 2. Database Setup

```bash
# Create PostgreSQL database
createdb book_my_parcel

# Enable PostGIS extension
psql book_my_parcel -c "CREATE EXTENSION IF NOT EXISTS postgis;"
```

### 3. Environment Configuration

Create a `.env` file in the root directory:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=book_my_parcel
DB_USER=your_db_user
DB_PASSWORD=your_db_password

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key_here
JWT_EXPIRES_IN=7d

# Google Maps API Keys
GOOGLE_API_KEY=your_google_api_key_here
GOOGLE_ADDRESS_VALIDATION_API_KEY=your_address_validation_key_here

# Server Configuration
PORT=3000
NODE_ENV=development

# File Upload Configuration
UPLOAD_PATH=./uploads
MAX_FILE_SIZE=5242880

# WebSocket Configuration
CORS_ORIGIN=http://localhost:5173

# FCM Configuration (Optional)
FCM_SERVER_KEY=your_fcm_server_key_here
```

### 4. Database Migration

```bash
# Run migrations to set up database schema
npm run migrate

# Seed initial data (optional)
npm run seed
```

### 5. Start Development Server

```bash
npm start
```

The server will start on `http://localhost:3000`

## 📁 Project Structure

```
backend/
├── src/
│   ├── config/           # Database and service configurations
│   ├── middlewares/      # Express middlewares (auth, validation, etc.)
│   ├── modules/          # Feature modules
│   │   ├── auth/         # Authentication & authorization
│   │   ├── user/         # User management
│   │   ├── parcel/       # Parcel management
│   │   ├── traveller/    # Traveller routes and profiles
│   │   ├── matching/     # Matching engine
│   │   ├── booking/      # Booking management
│   │   ├── payment/      # Payment processing
│   │   └── admin/        # Admin functionality
│   ├── services/         # Business logic services
│   │   ├── googleMaps.service.js      # Google Maps integration
│   │   ├── matchingEngine.service.js  # Core matching algorithm
│   │   ├── spatialMatching.service.js # PostGIS spatial queries
│   │   ├── notification.service.js    # FCM & notifications
│   │   └── polylineDecoder.service.js # Route geometry processing
│   ├── utils/            # Utility functions
│   ├── jobs/             # Background jobs
│   └── app.js            # Express app configuration
├── migrations/           # Database migrations
├── scripts/              # Utility scripts
├── uploads/              # File upload directory
├── server.js             # Application entry point
└── package.json
```

## 🔧 API Endpoints

### Authentication
- `POST /api/auth/signup` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/profile` - Get user profile
- `PUT /api/auth/profile` - Update user profile

### Parcel Management
- `POST /api/parcel/request` - Create parcel request
- `GET /api/parcel/:id` - Get parcel details
- `GET /api/user/requests` - Get user's parcel requests

### Traveller Routes
- `POST /api/traveller/routes` - Create new route
- `GET /api/traveller/routes` - Get traveller's routes
- `GET /api/traveller/routes/:id` - Get specific route

### Matching Engine
- `POST /api/parcel/:id/find-travellers` - Trigger matching
- `GET /api/parcel/:id/acceptances` - Get parcel acceptances
- `POST /api/parcel/:id/select-traveller` - Select traveller
- `POST /api/traveller/requests/:id/accept` - Accept parcel request
- `POST /api/traveller/requests/:id/reject` - Reject parcel request
- `GET /api/traveller/requests` - Get traveller requests

### Booking Management
- `POST /api/booking/create` - Create booking
- `GET /api/booking/:id` - Get booking details
- `POST /api/booking/:id/otp/verify` - Verify OTP

## 🗄️ Database Schema

### Core Tables
- `users` - User accounts and authentication
- `user_profiles` - User personal information
- `traveller_profiles` - Traveller-specific data
- `addresses` - Enriched address data with geocoding
- `parcels` - Parcel information and route data
- `traveller_routes` - Route geometry and scheduling
- `parcel_requests` - Matching requests between parcels and travellers
- `parcel_acceptances` - Accepted delivery requests
- `bookings` - Confirmed bookings with OTP verification

### Spatial Tables
- `route_places` - Place-ID associations for exact matching
- PostGIS geometry columns for spatial queries

## 🔍 Matching Algorithm

The system uses a sophisticated 5-stage matching pipeline:

1. **Geographic Matching**
   - Place-ID exact matching
   - JSONB array containment
   - City-level matching
   - Spatial buffer matching (PostGIS)

2. **Temporal Filtering**
   - One-time vs recurring route validation
   - Schedule compatibility checking

3. **Capacity & Preference Filtering**
   - Weight capacity validation
   - Parcel type preferences
   - Minimum earning thresholds

4. **Detour Estimation**
   - Haversine distance approximation
   - Quick filtering for efficiency

5. **Exact Detour Calculation**
   - Google Routes API integration
   - Precise detour calculation
   - Configurable thresholds (20% max detour)

## 🌐 Real-time Features

### WebSocket Events
- `new_request` - New parcel request for traveller
- `new_acceptance` - Traveller accepted parcel
- `parcel_selected` - Parcel assigned to traveller
- `request_expired` - Request expired

### Room Management
- `parcel_${parcelId}` - Parcel-specific updates
- `traveller_requests_${travellerId}` - Traveller request feed

## 🔐 Security Features

- JWT-based authentication with role-based access control
- Password hashing with bcrypt
- Input validation and sanitization
- CORS configuration
- Rate limiting middleware
- File upload validation

## 🚀 Deployment

### Environment Variables
Ensure all required environment variables are set in production:
- Database credentials
- Google Maps API keys
- JWT secrets
- FCM configuration

### Database Setup
1. Create PostgreSQL database with PostGIS extension
2. Run migrations: `npm run migrate`
3. Seed initial data: `npm run seed`

### Process Management
Use PM2 or similar for production deployment:

```bash
npm install -g pm2
pm2 start server.js --name "bmp-backend"
```

## 📊 Monitoring & Logging

- Request/response logging
- Error tracking and reporting
- Performance monitoring
- Database query optimization
- API usage analytics

## 🧪 Testing

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## 📝 License

This project is licensed under the ISC License.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Contact the development team
- Check the API documentation

## 🔄 Version History

- **v1.0.0** - Initial release with core functionality
- Advanced spatial matching with PostGIS
- Real-time WebSocket communication
- Comprehensive Google Maps integration
- Complete booking workflow with OTP verification