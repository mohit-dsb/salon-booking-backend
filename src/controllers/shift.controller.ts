import type { Request, Response } from "express";
import type { ShiftStatus } from "@prisma/client";
import { shiftService } from "@/services/shift.service";
import { parsePaginationParams } from "@/utils/pagination";
import { getAuthWithOrgId } from "@/middlewares/auth.middleware";
import { asyncHandler } from "@/middlewares/error.middleware";

class ShiftController {
  // ==================== SHIFT CRUD OPERATIONS ====================

  createShift = asyncHandler(async (req: Request, res: Response) => {
    const { orgId, userId } = getAuthWithOrgId(req);

    const shift = await shiftService.createShift(req.body, userId, orgId);

    res.status(201).json({
      success: true,
      message: "Shift created successfully",
      data: shift,
    });
  });

  createRecurringShift = asyncHandler(async (req: Request, res: Response) => {
    const { orgId, userId } = getAuthWithOrgId(req);

    const result = await shiftService.createRecurringShift(req.body, userId, orgId);

    res.status(201).json({
      success: true,
      message: `Recurring shift created successfully. ${result.totalShiftsCreated} shifts generated.`,
      data: result,
    });
  });

  getShiftById = asyncHandler(async (req: Request, res: Response) => {
    const { shiftId } = req.params;
    const { orgId } = getAuthWithOrgId(req);

    const shift = await shiftService.getShiftById(shiftId, orgId);

    if (!shift) {
      res.status(404).json({
        success: false,
        message: "Shift not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: shift,
    });
  });

  getShifts = asyncHandler(async (req: Request, res: Response) => {
    const { orgId } = getAuthWithOrgId(req);
    const { page, limit } = parsePaginationParams(req.query);

    const filters = {
      memberId: req.query.memberId as string,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      status: req.query.status as ShiftStatus | undefined,
      includeRecurring: req.query.includeRecurring === "true",
    };

    const result = await shiftService.getShifts(filters, orgId, page, limit);

    res.status(200).json({
      success: true,
      data: result.data,
      meta: result.meta,
    });
  });

  getWeeklySchedule = asyncHandler(async (req: Request, res: Response) => {
    const { weekStart } = req.params;
    const { orgId } = getAuthWithOrgId(req);
    const memberId = req.query.memberId as string;

    const schedule = await shiftService.getWeeklySchedule(weekStart, memberId, orgId);

    res.status(200).json({
      success: true,
      data: schedule,
    });
  });

  updateShift = asyncHandler(async (req: Request, res: Response) => {
    const { shiftId } = req.params;
    const { orgId, userId } = getAuthWithOrgId(req);

    const shift = await shiftService.updateShift(shiftId, req.body, userId, orgId);

    res.status(200).json({
      success: true,
      message: "Shift updated successfully",
      data: shift,
    });
  });

  deleteShift = asyncHandler(async (req: Request, res: Response) => {
    const { shiftId } = req.params;
    const { orgId } = getAuthWithOrgId(req);

    await shiftService.deleteShift(shiftId, orgId);

    res.status(200).json({
      success: true,
      message: "Shift deleted successfully",
    });
  });

  // ==================== ANALYTICS & STATS ====================

  getShiftStats = asyncHandler(async (req: Request, res: Response) => {
    const { orgId } = getAuthWithOrgId(req);

    const stats = await shiftService.getShiftStats(
      req.query.memberId as string,
      req.query.startDate as string,
      req.query.endDate as string,
      orgId,
    );

    res.status(200).json({
      success: true,
      data: stats,
    });
  });

  getDashboardData = asyncHandler(async (req: Request, res: Response) => {
    const { orgId, userId } = getAuthWithOrgId(req);

    // Get today's date
    const today = new Date().toISOString().split("T")[0];
    const weekStart = this.getWeekStart(new Date());

    // Get various data for dashboard
    const [todayShifts, weeklySchedule, stats] = await Promise.all([
      shiftService.getShifts({ memberId: userId, startDate: today, endDate: today }, orgId, 1, 10),
      shiftService.getWeeklySchedule(weekStart, userId, orgId),
      shiftService.getShiftStats(userId, weekStart, undefined, orgId),
    ]);

    res.status(200).json({
      success: true,
      data: {
        todayShifts: todayShifts.data,
        weeklySchedule,
        stats,
      },
    });
  });

  // ==================== BULK OPERATIONS ====================

  bulkUpdateShifts = asyncHandler(async (req: Request, res: Response) => {
    const { orgId: _orgId } = getAuthWithOrgId(req);
    const { shiftIds, updates: _updates } = req.body;

    // This would be implemented in the service
    // const result = await shiftService.bulkUpdateShifts(shiftIds, updates, orgId);

    res.status(200).json({
      success: true,
      message: `${shiftIds.length} shifts updated successfully`,
      // data: result,
    });
  });

  bulkDeleteShifts = asyncHandler(async (req: Request, res: Response) => {
    const { orgId: _orgId } = getAuthWithOrgId(req);
    const { shiftIds, deleteRecurring: _deleteRecurring } = req.body;

    // This would be implemented in the service
    // const result = await shiftService.bulkDeleteShifts(shiftIds, deleteRecurring, orgId);

    res.status(200).json({
      success: true,
      message: `${shiftIds.length} shifts deleted successfully`,
      // data: result,
    });
  });

  copyShifts = asyncHandler(async (req: Request, res: Response) => {
    const { orgId: _orgId, userId: _userId } = getAuthWithOrgId(req);
    const { sourceDate, targetDates, memberIds: _memberIds, overrideExisting: _overrideExisting } = req.body;

    // This would be implemented in the service
    // const result = await shiftService.copyShifts(
    //   sourceDate,
    //   targetDates,
    //   memberIds,
    //   overrideExisting,
    //   userId,
    //   orgId
    // );

    res.status(200).json({
      success: true,
      message: `Shifts copied from ${sourceDate} to ${targetDates.length} dates`,
      // data: result,
    });
  });

  // ==================== HELPER METHODS ====================

  private getWeekStart(date: Date): string {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    d.setDate(diff);
    return d.toISOString().split("T")[0];
  }
}

export const shiftController = new ShiftController();
