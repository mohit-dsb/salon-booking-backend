import { Router, Request, Response } from "express";
import categoryRoutes from "@/routes/v1/category.route";
import serviceRoutes from "@/routes/v1/service.route";
import memberRoutes from "@/routes/v1/member.route";
import { requireAuthWithOrgId } from "@/middlewares/auth.middleware";

const routerV1 = Router();

routerV1.use("/categories", requireAuthWithOrgId, categoryRoutes);
routerV1.use("/services", requireAuthWithOrgId, serviceRoutes);
routerV1.use("/members", requireAuthWithOrgId, memberRoutes);

routerV1.get("/", (_req: Request, res: Response) => {
  res.status(200).json({ message: "Welcome to the API" });
});

export default routerV1;
