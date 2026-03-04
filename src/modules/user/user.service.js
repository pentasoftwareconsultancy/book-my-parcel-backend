import TravellerRoute from "../traveller/travellerRoute.model.js";
import TravellerProfile from "../traveller/travellerProfile.model.js";
import User from "./user.model.js";

export const getActiveTravellers = async () => {
  console.log("Fetching active travellers with status 'ACTIVE'");
  return await TravellerRoute.findAll({
    where: { status: "ACTIVE" },
    include: [
      {
        model: TravellerProfile,
        as: "travellerProfile",
        include: [
          {
            model: User,
            as: "user",
            attributes: ["id", "name", "phone_number"],
          },
          console.log("Included TravellerProfile with User details"),
        ],
      },
      console.log("Included TravellerRoute with status 'ACTIVE'"),
    ],
  });
};