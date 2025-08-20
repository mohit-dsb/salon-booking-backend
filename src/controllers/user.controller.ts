import { MemberService } from "@/services/member.service";
import { verifyWebhook } from "@clerk/express/webhooks";
import type { NextFunction, Request, Response } from "express";
import { asyncHandler } from "@/middlewares/error.middleware";

export class UserController {
  private memberService = new MemberService();

  public syncClerkUser = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    try {
      console.log("Webhook received, verifying...");
      const evt = await verifyWebhook(req);
      console.log("Webhook verified successfully, event type:", evt.type);

      if (evt.type === "user.created") {
        console.log("Processing user.created event");
        await this.memberService.createMemberFromWebhook(evt.data);
      }

      if (evt.type === "user.updated") {
        console.log("Processing user.updated event");
        await this.memberService.updateMemberFromWebhook(evt.data.id, evt.data);
      }

      if (evt.type === "user.deleted" && evt.data.deleted) {
        console.log("Processing user.deleted event");
        await this.memberService.deleteMemberFromWebhook(evt.data.id as string);
      }

      // Handle organization membership events for members
      if (evt.type === "organizationMembership.created") {
        console.log("Processing organizationMembership.created event");
        const { organization, public_user_data } = evt.data;
        if (organization?.id && public_user_data?.user_id) {
          await this.memberService.handleOrganizationMembership(
            public_user_data.user_id,
            organization.id,
            'created'
          );
        }
      }

      if (evt.type === "organizationMembership.updated") {
        console.log("Processing organizationMembership.updated event");
        const { organization, public_user_data } = evt.data;
        if (organization?.id && public_user_data?.user_id) {
          await this.memberService.handleOrganizationMembership(
            public_user_data.user_id,
            organization.id,
            'updated'
          );
        }
      }

      if (evt.type === "organizationMembership.deleted") {
        console.log("Processing organizationMembership.deleted event");
        const { organization, public_user_data } = evt.data;
        if (organization?.id && public_user_data?.user_id) {
          await this.memberService.handleOrganizationMembership(
            public_user_data.user_id,
            organization.id,
            'deleted'
          );
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
