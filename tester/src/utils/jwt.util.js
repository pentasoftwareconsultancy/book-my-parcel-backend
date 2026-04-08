


import jwt from "jsonwebtoken";

export const generateToken = (user) => {
  const secret = process.env.JWT_SECRET;

  const id = user?.id || user?._id || user?.userId;
  if (!id) throw new Error("User/Admin ID is required");

  const isAdmin =
    user.role === "ADMIN" ||
    user.roles?.includes("ADMIN");

  return jwt.sign(
    {
      id,
    },
    secret,
    {
      expiresIn: isAdmin ? "1d" : "7d"
    }
  );
};
