-- Migration: Phase 3 - Place-ID Based Matching
-- Purpose: Create route_places table for exact place matching using Google Place IDs
-- Date: 2026-03-14

-- Create route_places table to store places associated with routes
CREATE TABLE route_places (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID NOT NULL REFERENCES traveller_routes(id) ON DELETE CASCADE,
  place_id VARCHAR(500) NOT NULL,
  place_type VARCHAR(50) NOT NULL,
  place_name VARCHAR(255),
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for fast lookups
CREATE INDEX idx_route_places_route_id ON route_places(route_id);
CREATE INDEX idx_route_places_place_id ON route_places(place_id);
CREATE INDEX idx_route_places_type ON route_places(place_type);
CREATE INDEX idx_route_places_route_type ON route_places(route_id, place_type);

-- Add comment for clarity
COMMENT ON TABLE route_places IS 'Stores Google Place IDs for each place (locality, city, taluka, pincode, landmark) associated with a route. Enables exact, unambiguous matching.';
COMMENT ON COLUMN route_places.place_id IS 'Google Place ID for the location';
COMMENT ON COLUMN route_places.place_type IS 'Type of place: locality, city, taluka, pincode, landmark';
COMMENT ON COLUMN route_places.place_name IS 'Human-readable name of the place';
