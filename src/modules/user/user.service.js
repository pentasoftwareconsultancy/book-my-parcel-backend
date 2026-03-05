import User from "./user.model.js";          
import UserProfile from "./userProfile.model.js";  

export async function getProfile(userId) {
  const user = await User.findOne({
    where: { id: userId },
    attributes: ["id", "email", "phone_number"],
    include: [
      {
        model: UserProfile,
        as: "profile",
        attributes: ["full_name", "city", "state"]  
      }
    ]
  });

  if (!user) throw new Error("User not found");

  return {
    fullName: user.profile?.full_name,  
    email:    user.email,
    phone:    user.phone_number,
    city:     user.profile?.city,
    state:    user.profile?.state,
  };
}


export async function updateProfile(userId, profileData) {
  const { fullName, email, phone_number, city, state } = profileData;

  // Update User table
  await User.update(
    { 
      name: fullName,
      email: email,
      phone_number: phone_number
    },
    { where: { id: userId } }
  );

  //  Update UserProfile table
  await UserProfile.update(
    { 
      full_name: fullName,
      city, 
      state 
    },
    { where: { user_id: userId } }
  );

  return await getProfile(userId);
}
