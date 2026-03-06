import express from "express";
import {
  signupController,
  loginController,
  // requestOTPController,
  // verifyOTPController,
  // checkUserExistsController,
  // updateUserProfile,
  // getProfileController
} from "./auth.controller.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";

const router = express.Router();

// Public routes
router.post("/signup", signupController);
router.post("/login", loginController);



// router.post("/request-otp", requestOTPController);
// router.post("/verify-otp", verifyOTPController);
// router.post("/check-user-exists", checkUserExistsController);

/*GET USER PROFILE*/
// router.get("/profile", authMiddleware, getProfileController);


// profile update 
// router.put("/update-profile", authMiddleware, updateUserProfile);

export default router;
