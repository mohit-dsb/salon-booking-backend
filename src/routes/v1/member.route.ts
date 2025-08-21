import { Router } from "express";
import { validate } from "@/middlewares/validation.middleware";
import { MemberController } from "@/controllers/member.controller";
import {
  createMemberSchema,
  updateMemberSchema,
  assignServicesSchema,
  memberQuerySchema,
  searchMemberSchema,
} from "@/validations/member.schema";

const router = Router();
const memberController = new MemberController();

// Stats and search routes (must come before parameterized routes)
router.get("/stats", memberController.getMemberStats);
router.get("/search", validate(searchMemberSchema), memberController.searchMembers);

// Profile routes for current user
router.get("/profile", memberController.getMemberProfile);
router.patch("/profile", memberController.updateMemberProfile);

// Service-specific routes
router.get("/by-service/:serviceId", memberController.getMembersByService);

// Main CRUD operations
router.get("/", validate(memberQuerySchema), memberController.getAllMembers);
router.post("/", validate(createMemberSchema), memberController.createMember);

// Parameterized routes (must come after static routes)
router.get("/:id", memberController.getMemberById);
router.patch("/:id", validate(updateMemberSchema), memberController.updateMember);
router.delete("/:id", memberController.deleteMember);

// Member service management
router.patch("/:id/services", validate(assignServicesSchema), memberController.assignServices);

// Member status management
router.patch("/:id/status", memberController.toggleMemberStatus);

export default router;
