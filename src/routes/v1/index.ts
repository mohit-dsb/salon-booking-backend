import { Router } from "express";
import { clerkClient, getAuth } from "@clerk/express";

const router = Router();

router.get("/protected", async (req, res) => {
  try {
    // Use `getAuth()` to get the user's `userId`
    const { userId } = getAuth(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized - No valid session found",
      });
    }

    // Use Clerk's JavaScript Backend SDK to get the user's User object
    const user = await clerkClient.users.getUser(userId);

    return res.json({
      success: true,
      user: {
        id: user.id,
        emailAddresses: user.emailAddresses,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    });
  } catch (error) {
    console.error("Error in protected route:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

router.get("/", (req, res) => {
  res.status(200).json({ message: "Welcome to the API" });
});

export default router;
