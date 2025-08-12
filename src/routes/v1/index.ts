import { Router, Request, Response } from "express";
import categoryRoutes from "./category.route";
import { requireAuth } from "@clerk/express";
import { UserController } from "@/controllers/user.controller";

const router = Router();

const userController = new UserController();

router.post("/sync-clerk-user", userController.syncClerkUser);

router.use("/categories", requireAuth(), categoryRoutes);

router.get("/", (_req: Request, res: Response) => {
  res.status(200).json({ message: "Welcome to the API" });
});

export default router;
