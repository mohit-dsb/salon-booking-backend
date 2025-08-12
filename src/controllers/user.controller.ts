import { UserService } from "@/services/user.service";
import { verifyWebhook } from "@clerk/express/webhooks";
import { NextFunction, Request, Response } from "express";
import { asyncHandler } from "@/middlewares/error.middleware";

export class UserController {
  private userService = new UserService();

  public syncClerkUser = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const evt = await verifyWebhook(req);

    if (evt.type === "user.created") {
      this.userService.createUser(evt.data);
    }

    if (evt.type === "user.updated") {
      this.userService.updateUser(evt.data.id, evt.data);
    }

    if (evt.type === "user.deleted" && evt.data.deleted) {
      this.userService.deleteUser(evt.data.id as string);
    }

    res.sendStatus(200);
  });
}
