import { UserService } from "@/services/user.service";
import { MemberService } from "@/services/member.service";
import { verifyWebhook } from "@clerk/express/webhooks";
import type { NextFunction, Request, Response } from "express";
import { asyncHandler } from "@/middlewares/error.middleware";

export class UserController {
  private userService = new UserService();
  private memberService = new MemberService();

  public syncClerkUser = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    try {
      console.log("Webhook received, verifying...");
      const evt = await verifyWebhook(req);
      console.log("Webhook verified successfully, event type:", evt.type);

      if (evt.type === "user.created") {
        console.log("Processing user.created event");
        await this.userService.createUser(evt.data);
      }

      if (evt.type === "user.updated") {
        console.log("Processing user.updated event");
        await this.userService.updateUser(evt.data.id, evt.data);
      }

      if (evt.type === "user.deleted" && evt.data.deleted) {
        console.log("Processing user.deleted event");
        await this.userService.deleteUser(evt.data.id as string);
      }

      // Handle organization membership events for members
      if (evt.type === "organizationMembership.created") {
        console.log("Processing organizationMembership.created event");
        const { organization, public_user_data } = evt.data;
        if (organization?.id && public_user_data?.user_id) {
          // Check if this user is already a member in our database
          const existingMember = await this.memberService.getMemberByClerkId(public_user_data.user_id, organization.id);

          if (existingMember) {
            // Sync member data from Clerk
            await this.memberService.syncMemberFromClerk(public_user_data.user_id, organization.id, {
              firstName: public_user_data.first_name || undefined,
              lastName: public_user_data.last_name || undefined,
              emailAddresses: [{ emailAddress: "" }], // Email not available in this event
              imageUrl: public_user_data.image_url || undefined,
            });
          }
        }
      }

      if (evt.type === "organizationMembership.updated") {
        console.log("Processing organizationMembership.updated event");
        const { organization, public_user_data } = evt.data;
        if (organization?.id && public_user_data?.user_id) {
          // Sync member data from Clerk
          await this.memberService.syncMemberFromClerk(public_user_data.user_id, organization.id, {
            firstName: public_user_data.first_name || undefined,
            lastName: public_user_data.last_name || undefined,
            emailAddresses: [{ emailAddress: "" }], // Email not available in this event
            imageUrl: public_user_data.image_url || undefined,
          });
        }
      }

      console.log("Webhook processed successfully");
      res.sendStatus(200);
    } catch (error) {
      console.error("Webhook verification failed:", error);
      res.status(400).json({ error: "Webhook verification failed" });
    }
  });
}
