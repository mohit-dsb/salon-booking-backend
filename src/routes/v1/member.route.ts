import { Router } from "express";
import { validate } from "@/middlewares/validation.middleware";
import { MemberController } from "@/controllers/member.controller";
import { createMemberSchema, updateMemberSchema, assignServicesSchema } from "@/validations/member.schema";

const router = Router();
const memberController = new MemberController();

// Member CRUD operations
router.get("/", memberController.getAllMembers);
router.get("/:id", memberController.getMemberById);
router.delete("/:id", memberController.deleteMember);
router.get("/stats", memberController.getMemberStats);
router.get("/search", memberController.searchMembers);
router.get("/profile", memberController.getMemberProfile);
router.put("/profile", memberController.updateMemberProfile);
router.post("/", validate(createMemberSchema), memberController.createMember);
router.put("/:id", validate(updateMemberSchema), memberController.updateMember);

// Member service assignments
router.get("/service/:serviceId", memberController.getMembersByService);
router.put("/:id/services", validate(assignServicesSchema), memberController.assignServices);

// Member status management
router.patch("/:id/toggle-status", memberController.toggleMemberStatus);

export default router;
