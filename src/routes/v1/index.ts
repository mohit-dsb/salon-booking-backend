import { Router, Request, Response } from "express";
import categoryRoutes from "./category.route";
import { UserController } from "@/controllers/user.controller";
import { customAuth } from "@/middlewares/error.middleware";

const routerV1 = Router();

const userController = new UserController();

routerV1.post("/sync-clerk-user", userController.syncClerkUser);

routerV1.use("/categories", customAuth, categoryRoutes);

routerV1.get("/", (_req: Request, res: Response) => {
  res.status(200).json({ message: "Welcome to the API" });
});

export default routerV1;
