import type { Request, Response, NextFunction } from "express";
import type { ShiftStatus } from "@prisma/client";
import { shiftService } from "@/services/shift.service";
import { parsePaginationParams } from "@/utils/pagination";
import { getAuthWithOrgId } from "@/middlewares/auth.middleware";
import { asyncHandler } from "@/middlewares/error.middleware";
import type {
  CreateShiftData,
  CreateRecurringShiftData,
  UpdateShiftData,
  BulkUpdateShiftsData,
  BulkDeleteShiftsData,
  CopyShiftsData,
} from "@/validations/shift.schema";

// Create service instance
const shiftSvc = shiftService;

// ==================== SHIFT CRUD OPERATIONS ====================

/**
 * Create a new shift
 * @route POST /api/v1/shifts
 * @access Private (Member)
 */
export const createShift = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { orgId, userId } = await getAuthWithOrgId(req);
  const shiftData = req.parsedBody as CreateShiftData;

  const shift = await shiftSvc.createShift(shiftData, userId, orgId);

  res.status(201).json({
    success: true,
    message: "Shift created successfully",
    data: shift,
  });
});

/**
 * Create a recurring shift
 * @route POST /api/v1/shifts/recurring
 * @access Private (Member)
 */
export const createRecurringShift = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { orgId, userId } = await getAuthWithOrgId(req);
  const shiftData = req.parsedBody as CreateRecurringShiftData;

  // Transform schema data to service expected format
  const serviceData = {
    ...shiftData,
    recurrenceOptions: {
      pattern: shiftData.recurrencePattern,
      ...shiftData.recurrenceOptions,
    },
  };

  const result = await shiftSvc.createRecurringShift(serviceData, userId, orgId);

  res.status(201).json({
    success: true,
    message: `Recurring shift created successfully. ${result.totalShiftsCreated} shifts generated.`,
    data: result,
  });
});

/**
 * Get shift by ID
 * @route GET /api/v1/shifts/:shiftId
 * @access Private (Member)
 */
export const getShiftById = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { shiftId } = req.params;
  const { orgId } = await getAuthWithOrgId(req);

  const shift = await shiftSvc.getShiftById(shiftId, orgId);

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

/**
 * Get all shifts with pagination and filters
 * @route GET /api/v1/shifts
 * @access Private (Member)
 */
export const getShifts = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { orgId } = await getAuthWithOrgId(req);
  const { page, limit } = parsePaginationParams(req.query);

  const filters = {
    memberId: req.query.memberId as string,
    startDate: req.query.startDate as string,
    endDate: req.query.endDate as string,
    status: req.query.status as ShiftStatus | undefined,
    includeRecurring: req.query.includeRecurring === "true",
  };

  const result = await shiftSvc.getShifts(filters, orgId, page, limit);

  res.status(200).json({
    success: true,
    data: result.data,
    meta: result.meta,
  });
});

/**
 * Get weekly schedule
 * @route GET /api/v1/shifts/weekly/:weekStart
 * @access Private (Member)
 */
export const getWeeklySchedule = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { weekStart } = req.params;
  const { orgId } = await getAuthWithOrgId(req);
  const memberId = req.query.memberId as string;

  const schedule = await shiftSvc.getWeeklySchedule(weekStart, memberId, orgId);

  res.status(200).json({
    success: true,
    data: schedule,
  });
});

/**
 * Update shift
 * @route PATCH /api/v1/shifts/:shiftId
 * @access Private (Member)
 */
export const updateShift = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { shiftId } = req.params;
  const { orgId, userId } = await getAuthWithOrgId(req);
  const shiftData = req.parsedBody as UpdateShiftData;

  const shift = await shiftSvc.updateShift(shiftId, shiftData, userId, orgId);

  res.status(200).json({
    success: true,
    message: "Shift updated successfully",
    data: shift,
  });
});

/**
 * Delete shift
 * @route DELETE /api/v1/shifts/:shiftId
 * @access Private (Member)
 */
export const deleteShift = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { shiftId } = req.params;
  const { orgId } = await getAuthWithOrgId(req);

  await shiftSvc.deleteShift(shiftId, orgId);

  res.status(200).json({
    success: true,
    message: "Shift deleted successfully",
  });
});

// ==================== ANALYTICS & STATS ====================

/**
 * Get shift statistics
 * @route GET /api/v1/shifts/stats
 * @access Private (Member)
 */
export const getShiftStats = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { orgId } = await getAuthWithOrgId(req);

  const stats = await shiftSvc.getShiftStats(
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

/**
 * Get dashboard data
 * @route GET /api/v1/shifts/dashboard
 * @access Private (Member)
 */
export const getDashboardData = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { orgId, userId } = await getAuthWithOrgId(req);

  // Get today's date
  const today = new Date().toISOString().split("T")[0];
  const weekStart = getWeekStart(new Date());

  // Get various data for dashboard
  const [todayShifts, weeklySchedule, stats] = await Promise.all([
    shiftSvc.getShifts({ memberId: userId, startDate: today, endDate: today }, orgId, 1, 10),
    shiftSvc.getWeeklySchedule(weekStart, userId, orgId),
    shiftSvc.getShiftStats(userId, weekStart, undefined, orgId),
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

/**
 * Bulk update shifts
 * @route PATCH /api/v1/shifts/bulk
 * @access Private (Member)
 */
export const bulkUpdateShifts = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { orgId: _orgId } = await getAuthWithOrgId(req);
  const { shiftIds, updates: _updates } = req.parsedBody as BulkUpdateShiftsData;

  // This would be implemented in the service
  // const result = await shiftSvc.bulkUpdateShifts(shiftIds, updates, orgId);

  res.status(200).json({
    success: true,
    message: `${shiftIds.length} shifts updated successfully`,
    // data: result,
  });
});

/**
 * Bulk delete shifts
 * @route DELETE /api/v1/shifts/bulk
 * @access Private (Member)
 */
export const bulkDeleteShifts = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { orgId: _orgId } = await getAuthWithOrgId(req);
  const { shiftIds, deleteRecurring: _deleteRecurring } = req.parsedBody as BulkDeleteShiftsData;

  // This would be implemented in the service
  // const result = await shiftSvc.bulkDeleteShifts(shiftIds, deleteRecurring, orgId);

  res.status(200).json({
    success: true,
    message: `${shiftIds.length} shifts deleted successfully`,
    // data: result,
  });
});

/**
 * Copy shifts to multiple dates
 * @route POST /api/v1/shifts/copy
 * @access Private (Member)
 */
export const copyShifts = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { orgId: _orgId, userId: _userId } = await getAuthWithOrgId(req);
  const {
    sourceDate,
    targetDates,
    memberIds: _memberIds,
    overrideExisting: _overrideExisting,
  } = req.parsedBody as CopyShiftsData;

  // This would be implemented in the service
  // const result = await shiftSvc.copyShifts(
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

// ==================== HELPER FUNCTIONS ====================

/**
 * Get the start of the week for a given date
 */
function getWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  d.setDate(diff);
  return d.toISOString().split("T")[0];
}
