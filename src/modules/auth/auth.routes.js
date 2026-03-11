// import express from "express";
// import {
//   signupController,
//   loginController,
  
// } from "./auth.controller.js";

// const router = express.Router();

// // Public routes
// router.post("/signup", signupController);
// router.post("/login", loginController);

// export default router;



import express from "express";
import {
  signupController,
  loginController,
  
  updateUserProfile,
  getProfileController,
  uploadProfilePhotoController,
  updatePasswordController 
} from "./auth.controller.js";

import { uploadProfile } from "../../utils/fileUpload.util.js";

import { authMiddleware } from "../../middlewares/auth.middleware.js";

const router = express.Router();

// Public routes
router.post("/signup", signupController);
router.post("/login", loginController);



/*GET USER PROFILE*/
router.get("/profile", authMiddleware, getProfileController);

// profile update 
router.put("/update-profile", authMiddleware, updateUserProfile);

// profile photo upload/update
router.post("/profile/photo", authMiddleware, uploadProfile.single("photo"), uploadProfilePhotoController);
router.put("/profile/photo", authMiddleware, uploadProfile.single("photo"), uploadProfilePhotoController);

//Update password
router.put("/update-password", authMiddleware, updatePasswordController);

export default router;