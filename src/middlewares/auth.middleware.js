


// import jwt from "jsonwebtoken";

// export function authMiddleware(req, res, next) {
//   console.log("Auth Middleware Invoked");
//   try {
//     console.log("Extracting Authorization Header");
//     const authHeader = req.headers.authorization;
//     console.log("Authorization Header:", authHeader);
//     if (!authHeader) {
//       return res.status(401).json({ error: "No token provided" });
//     }
//     console.log("Verifying Token");

//     const token = authHeader.split(" ")[1];
//     console.log("Token Extracted:", token);
//     const decoded = jwt.verify(token, process.env.JWT_SECRET);
//     console.log("Token Verified:", decoded);

//     // ✅ ONLY attach user id
//     req.user = { id: decoded.id };


//     console.log("User ID attached to request:", req.user.id);

//     next();
//     console.log("Auth Middleware Completed Successfully");
//   } catch (error) {
//     console.error("Auth Middleware Error:", error.message);
//     return res.status(401).json({ error: "Invalid or expired token" });
//   }
// }




 import jwt from "jsonwebtoken";
import User from "../modules/user/user.model.js"; // adjust path

export async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader)
      return res.status(401).json({ error: "No token provided" });

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findByPk(decoded.id);
    if (!user)
      return res.status(401).json({ error: "User not found" });

    req.user = { id: user.id };

    next();
  } catch (err) {
    console.error(err);
    res.status(401).json({ error: "Invalid token" });
  }
}
