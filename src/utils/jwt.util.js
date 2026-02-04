import jwt from "jsonwebtoken";

export function generateToken(payload) {
  // Accept both userId and id for backward compatibility
  const userId = payload?.userId || payload?.id;
  if (!userId) throw new Error("generateToken: userId is required");

  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not defined");

  // If secret exists, we don't need to explicitly set algorithm
  const token = jwt.sign(
    { id: userId },
    secret,
    { expiresIn: "7d" }
  );

  return token;
}
