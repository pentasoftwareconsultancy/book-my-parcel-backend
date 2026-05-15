// modules/tracking/tracking.middleware.js
import { User, Role } from "../associations.js"; // ← from associations, not model file directly

export function authorizeRoles(...roles) {
  return async (req, res, next) => {
    try {
      const user = await User.findByPk(req.user.id, {
        include: [
          {
            model: Role,
            as: "roles",
            through: { attributes: [] },
            attributes: ["name"],
          },
        ],
      });

      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }

      const userRoles = user.roles.map((r) => r.name);

      const hasRole = roles.some((role) => userRoles.includes(role));

      if (!hasRole) {
        return res.status(403).json({
          error: `Access denied. Required: ${roles.join(" or ")}`,
        });
      }

      req.user.roles = userRoles;
      next();
    } catch (err) {
      console.error("authorizeRoles error:", err.message);
      return res.status(500).json({ error: "Authorization failed" });
    }
  };
}