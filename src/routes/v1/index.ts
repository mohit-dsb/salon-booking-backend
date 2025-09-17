import { Router, type Request, type Response } from "express";
import categoryRoutes from "@/routes/v1/category.route";
import serviceRoutes from "@/routes/v1/service.route";
import memberRoutes from "@/routes/v1/member.route";
import clientRoutes from "@/routes/v1/client.route";
import appointmentRoutes from "@/routes/v1/appointment.route";
import shiftRoutes from "@/routes/v1/shift.route";

const routerV1 = Router();

routerV1.use("/categories", categoryRoutes);
routerV1.use("/services", serviceRoutes);
routerV1.use("/members", memberRoutes);
routerV1.use("/clients", clientRoutes);
routerV1.use("/appointments", appointmentRoutes);
routerV1.use("/shifts", shiftRoutes);

routerV1.get("/", (_req: Request, res: Response) => {
  res.status(200).json({ message: "Welcome to the API" });
});

export default routerV1;
