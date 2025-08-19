import { Router } from "express";
import { MemberController } from "@/controllers/member.controller";
import { validate } from "@/middlewares/validation.middleware";
import { 
  createMemberSchema, 
  updateMemberSchema, 
  assignServicesSchema 
} from "@/validations/member.schema";

const router = Router();
const memberController = new MemberController();

// Member CRUD operations
router.post("/", validate(createMemberSchema), memberController.createMember);
router.get("/", memberController.getAllMembers);
router.get("/stats", memberController.getMemberStats);
router.get("/search", memberController.searchMembers);
router.get("/profile", memberController.getMemberProfile);
router.put("/profile", memberController.updateMemberProfile);
router.get("/:id", memberController.getMemberById);
router.put("/:id", validate(updateMemberSchema), memberController.updateMember);
router.delete("/:id", memberController.deleteMember);

// Member service assignments
router.put("/:id/services", validate(assignServicesSchema), memberController.assignServices);
router.get("/service/:serviceId", memberController.getMembersByService);

// Member status management
router.patch("/:id/toggle-status", memberController.toggleMemberStatus);

export default router;
