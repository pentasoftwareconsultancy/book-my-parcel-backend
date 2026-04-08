
import * as travellerService from "./traveller.service.js";
import { responseSuccess } from "../../utils/response.util.js";

/* ─────────────────────────────
   SUBMIT KYC
───────────────────────────── */
export const submitKYC = async (req, res, next) => {
  try {
    const data = await travellerService.submitKYC(
      req.user.id,
      req.body,
      req.files
    );
    return responseSuccess(res, data, "KYC Submitted", 200);
  } catch (err) {
    next(err);
  }
};


/* ─────────────────────────────
   GET MY KYC
───────────────────────────── */
export const getMyKYC = async (req, res, next) => {
  try {
    const data = await travellerService.getMyKYC(req.user.id); // ✅
    return responseSuccess(res, data, "KYC fetched");
  } catch (err) {
    next(err);
  }
};


/* ─────────────────────────────
   GET ALL KYC - ADMIN
───────────────────────────── */
export const getAllKYCs = async (req, res, next) => {
  try {
    const data = await travellerService.getAllKYCs();
    return responseSuccess(res, { count: data.length, kycs: data }, "All KYCs fetched");
  } catch (err) {
    next(err);
  }
};


/* ─────────────────────────────
   UPDATE KYC STATUS - ADMIN
───────────────────────────── */
export const updateKYCStatus = async (req, res, next) => {
  try {
    const data = await travellerService.updateKYCStatus(
      req.params.id,
      req.body.status
    );
    return responseSuccess(res, data, "KYC status updated");
  } catch (err) {
    next(err);
  }
};


/* ─────────────────────────────
   GET TRAVELLER DELIVERIES  ✅
───────────────────────────── */
export const getTravelerDeliveries = async (req, res, next) => {
  try {
    const data = await travellerService.fetchTravellerDeliveries(
      req.user.id,
      req.query
    );
    return responseSuccess(res, data, "Deliveries fetched successfully");
  } catch (error) {
    console.error("getTravelerDeliveries ERROR:", error.message);
    next(error);
  }
};


/* ─────────────────────────────
   GET TRAVELLER STATS  ✅
───────────────────────────── */
export const getTravelerStats = async (req, res, next) => {
  try {
    const stats = await travellerService.fetchTravellerStats(
      req.user.id // ✅
    );
    return responseSuccess(res, { stats }, "Stats fetched successfully");
  } catch (error) {
    console.error("getTravelerStats ERROR:", error.message);
    next(error);
  }
};


/* ─────────────────────────────
   GET TRAVELLER PARCEL REQUESTS FOR DASHBOARD  ✅
───────────────────────────── */
export const getTravelerParcelRequests = async (req, res, next) => {
  try {
    const data = await travellerService.fetchTravellerParcelRequests(
      req.user.id,
      req.query
    );
    return responseSuccess(res, data, "Parcel requests fetched successfully");
  } catch (error) {
    console.error("getTravelerParcelRequests ERROR:", error.message);
    next(error);
  }
};


/* ─────────────────────────────
   DELIVERY STATUS & OTP MANAGEMENT  ✅ NEW
───────────────────────────── */

/**
 * Update booking status (CONFIRMED → PICKUP)
 */
export const updateBookingStatus = async (req, res, next) => {
  try {
    const { bookingId } = req.params;
    const { status } = req.body;
    
    const result = await travellerService.updateBookingStatus(
      bookingId,
      status,
      req.user.id
    );
    
    return responseSuccess(res, result, "Status updated successfully");
  } catch (error) {
    console.error("updateBookingStatus ERROR:", error.message);
    next(error);
  }
};

/**
 * Generate OTP for pickup/delivery
 */
export const generateOTP = async (req, res, next) => {
  try {
    const { bookingId } = req.params;
    const { type } = req.body; // 'pickup' or 'delivery'
    
    const result = await travellerService.generateOTP(bookingId, type);
    
    return responseSuccess(res, result, "OTP generated successfully");
  } catch (error) {
    console.error("generateOTP ERROR:", error.message);
    next(error);
  }
};

/**
 * Verify OTP and update status
 */
export const verifyOTP = async (req, res, next) => {
  try {
    const { bookingId } = req.params;
    const { otp, type } = req.body; // type: 'pickup' or 'delivery'
    
    const result = await travellerService.verifyOTPAndUpdateStatus(
      bookingId,
      otp,
      type,
      req.user.id
    );
    
    return responseSuccess(res, result, "OTP verified successfully");
  } catch (error) {
    console.error("verifyOTP ERROR:", error.message);
    next(error);
  }
};
export const createRoute = async (req, res, next) => {
  try {
    const data = await travellerService.createRoute(req.user.id, req.body); // ✅
    return responseSuccess(res, data, "Route created successfully", 201);
  } catch (err) {
    next(err);
  }
};


/* ─────────────────────────────
   GET MY ROUTES
───────────────────────────── */
export const getMyRoutes = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const data = await travellerService.getMyRoutes(
      req.user.id, // ✅
      { status, page, limit }
    );
    return responseSuccess(res, data, "Routes fetched");
  } catch (err) {
    next(err);
  }
};


/* ─────────────────────────────
   GET ROUTE BY ID
───────────────────────────── */
export const getRouteById = async (req, res, next) => {
  try {
    const data = await travellerService.getRouteById(req.params.id);
    return responseSuccess(res, data, "Route fetched");
  } catch (err) {
    next(err);
  }
};


/* ─────────────────────────────
   UPDATE ROUTE
───────────────────────────── */
export const updateRoute = async (req, res, next) => {
  try {
    const data = await travellerService.updateRoute(
      req.params.id,
      req.user.id, // ✅
      req.body
    );
    return responseSuccess(res, data, "Route updated successfully");
  } catch (err) {
    next(err);
  }
};


/* ─────────────────────────────
   DELETE ROUTE
───────────────────────────── */
export const deleteRoute = async (req, res, next) => {
  try {
    await travellerService.deleteRoute(req.params.id, req.user.id); // ✅
    return responseSuccess(res, null, "Route deleted successfully");
  } catch (err) {
    next(err);
  }
};