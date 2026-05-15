


import jwt from "jsonwebtoken";
import { getSessionVersion } from "../redis/services/sessionVersion.service.js";

// Read session_timeout_mins from platform_settings cache (fallback to defaults)
// NOTE: session_timeout_mins is an inactivity setting — JWT tokens should be
// long-lived (days) so users aren't force-logged out mid-session.
async function getSessionExpiry(isAdmin) {
  return isAdmin ? "1d" : "7d";
}

export const generateToken = async (user) => {
  const secret = process.env.JWT_SECRET;

  const id = user?.id || user?._id || user?.userId;
  if (!id) throw new Error("User/Admin ID is required");

  const isAdmin = user.role === "ADMIN" || user.roles?.includes("ADMIN");
  const expiresIn = await getSessionExpiry(isAdmin);
  const sessionVersion = await getSessionVersion(id);

  return jwt.sign({ id, sv: sessionVersion }, secret, { expiresIn });
};
