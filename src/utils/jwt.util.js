// import jwt from "jsonwebtoken";

// export function generateToken(payload) {
//   // Accept both userId and id for backward compatibility
//   const userId = payload?.userId || payload?.id;
//   if (!userId) throw new Error("generateToken: userId is required");

//   const secret = process.env.JWT_SECRET;
//   if (!secret) throw new Error("JWT_SECRET is not defined");

//   // If secret exists, we don't need to explicitly set algorithm
//   const token = jwt.sign(
//     { id: userId },
//     secret,
//     { expiresIn: "7d" }
//   );

//   return token;
// }


import jwt from "jsonwebtoken";

export const generateToken = (user) => {
  const secret = process.env.JWT_SECRET;

  const id = user?.id || user?._id || user?.userId;
  if (!id) throw new Error("User/Admin ID is required");

  // Decide expiry using DB role
  const isAdmin =
    user.role === "ADMIN" ||
    user.roles?.includes("ADMIN");

  return jwt.sign(
    {
      id,
      // email: user.email || null
    },
    secret,
    {
      expiresIn: isAdmin ? "1d" : "7d"
    }
  );
};
