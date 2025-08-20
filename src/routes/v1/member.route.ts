import { Router } from "express";
import { validate } from "@/middlewares/validation.middleware";
import { MemberController } from "@/controllers/member.controller";
import {
  createMemberSchema,
  updateMemberSchema,
  assignServicesSchema,
  memberQuerySchema,
  searchMemberSchema,
  memberParamsSchema,
  serviceParamsSchema,
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
router.get("/by-service/:serviceId", validate(serviceParamsSchema), memberController.getMembersByService);

// Main CRUD operations
router.get("/", validate(memberQuerySchema), memberController.getAllMembers);
router.post("/", validate(createMemberSchema), memberController.createMember);

// Parameterized routes (must come after static routes)
router.get("/:id", validate(memberParamsSchema), memberController.getMemberById);
router.patch("/:id", validate(memberParamsSchema), validate(updateMemberSchema), memberController.updateMember);
router.delete("/:id", validate(memberParamsSchema), memberController.deleteMember);

// Member service management
router.patch(
  "/:id/services",
  validate(memberParamsSchema),
  validate(assignServicesSchema),
  memberController.assignServices,
);

// Member status management
router.patch("/:id/status", validate(memberParamsSchema), memberController.toggleMemberStatus);

export default router;
