import { responseError } from "../utils/response.util.js";
import { ROLES } from "../utils/constants.js";
import User from "../modules/user/user.model.js";
import Role from "../modules/user/role.model.js";

/**
 * Middleware to check if user has required role(s)
 * @param {string|string[]} allowedRoles - Single role or array of roles
 */
export const requireRole = (allowedRoles) => {
  return async (req, res, next) => {
    try {
      // Ensure user is authenticated (should be set by authMiddleware)
      if (!req.user || !req.user.id) {
        return responseError(res, "Authentication required", 401);
      }

      // Normalize to array
      const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

      // Fetch user with roles
      const user = await User.findByPk(req.user.id, {
        include: [{
          model: Role,
          as: "roles",
          through: { attributes: [] },
          attributes: ["name"],
        }],
      });

      if (!user) {
        return responseError(res, "User not found", 404);
      }

      // Extract role names
      const userRoles = user.roles.map(r => r.name);

      // Check if user has any of the required roles
      const hasRequiredRole = roles.some(role => userRoles.includes(role));

      if (!hasRequiredRole) {
        return responseError(
          res,
          `Access denied. Required role: ${roles.join(" or ")}`,
          403
        );
      }

      // Attach user roles to request for further use
      req.userRoles = userRoles;
      next();
    } catch (error) {
      console.error("[Role Middleware] Error:", error.message);
      return responseError(res, "Authorization check failed", 500);
    }
  };
};

/**
 * Shorthand middleware for admin-only routes
 */
export const requireAdmin = requireRole(ROLES.ADMIN);

/**
 * Shorthand middleware for traveller-only routes
 */
export const requireTraveller = requireRole(ROLES.TRAVELLER);

/**
 * Shorthand middleware for individual user routes
 */
export const requireIndividual = requireRole(ROLES.INDIVIDUAL);

/**
 * Middleware for routes accessible by multiple roles
 */
export const requireAnyRole = (...roles) => requireRole(roles);
