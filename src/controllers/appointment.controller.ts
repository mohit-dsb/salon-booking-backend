import type { AppointmentStatus } from "@prisma/client";
import { parsePaginationParams } from "@/utils/pagination";
import type { Request, Response, NextFunction } from "express";
import { getAuthWithOrgId } from "@/middlewares/auth.middleware";
import { AppointmentService } from "@/services/appointment.service";
import { asyncHandler, AppError } from "@/middlewares/error.middleware";

export class AppointmentController {
  private appointmentService = new AppointmentService();

  // Create a new appointment
  public createAppointment = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { orgId, userId } = getAuthWithOrgId(req);
    const appointmentData = req.body;

    const appointment = await this.appointmentService.createAppointment(orgId, appointmentData, userId as string);

    res.status(201).json({
      success: true,
      data: appointment,
      message: "Appointment created successfully",
    });
  });

  // Create walk-in appointment (now uses the same method as regular appointments)
  public createWalkInAppointment = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { orgId } = getAuthWithOrgId(req);
    const appointmentData = req.body;
    const { userId } = res.locals;

    const appointment = await this.appointmentService.createAppointment(orgId, appointmentData, userId as string);

    res.status(201).json({
      success: true,
      data: appointment,
      message: "Walk-in appointment created successfully",
    });
  });

  // Get all appointments with pagination and filters
  public getAllAppointments = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { orgId } = getAuthWithOrgId(req);
    const pagination = parsePaginationParams(req.query);

    // Extract filters from query parameters (validated by middleware)
    const filters: {
      clientId?: string;
      memberId?: string;
      serviceId?: string;
      status?: AppointmentStatus;
      startDate?: string;
      endDate?: string;
      search?: string;
      isWalkIn?: boolean;
    } = {};

    if (req.query.clientId) {
      filters.clientId = req.query.clientId as string;
    }

    if (req.query.memberId) {
      filters.memberId = req.query.memberId as string;
    }

    if (req.query.serviceId) {
      filters.serviceId = req.query.serviceId as string;
    }

    if (req.query.status) {
      filters.status = req.query.status as AppointmentStatus;
    }

    if (req.query.startDate) {
      filters.startDate = req.query.startDate as string;
    }

    if (req.query.endDate) {
      filters.endDate = req.query.endDate as string;
    }

    if (req.query.search) {
      filters.search = req.query.search as string;
    }

    if (req.query.isWalkIn !== undefined) {
      filters.isWalkIn = req.query.isWalkIn === "true";
    }

    const result = await this.appointmentService.getAllAppointments(orgId, pagination, filters);

    res.status(200).json({
      success: true,
      data: result.appointments,
      pagination: result.pagination,
      message: "Appointments retrieved successfully",
    });
  });

  // Get appointment by ID
  public getAppointmentById = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { orgId } = getAuthWithOrgId(req);
    const { id } = req.params;

    const appointment = await this.appointmentService.getAppointmentById(id, orgId);

    res.status(200).json({
      success: true,
      data: appointment,
      message: "Appointment retrieved successfully",
    });
  });

  // Update appointment
  public updateAppointment = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { orgId } = getAuthWithOrgId(req);
    const { id } = req.params;
    const updateData = req.body;

    const appointment = await this.appointmentService.updateAppointment(id, orgId, updateData);

    res.status(200).json({
      success: true,
      data: appointment,
      message: "Appointment updated successfully",
    });
  });

  // Cancel appointment
  public cancelAppointment = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { orgId } = getAuthWithOrgId(req);
    const { id } = req.params;
    const { cancellationReason } = req.body;

    if (!cancellationReason) {
      throw new AppError("Cancellation reason is required", 400);
    }

    const appointment = await this.appointmentService.cancelAppointment(id, orgId, cancellationReason);

    res.status(200).json({
      success: true,
      data: appointment,
      message: "Appointment cancelled successfully",
    });
  });

  // Reschedule appointment
  public rescheduleAppointment = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { orgId } = getAuthWithOrgId(req);
    const { id } = req.params;
    const { startTime, notes } = req.body;

    if (!startTime) {
      throw new AppError("New start time is required", 400);
    }

    const appointment = await this.appointmentService.rescheduleAppointment(id, orgId, startTime, notes);

    res.status(200).json({
      success: true,
      data: appointment,
      message: "Appointment rescheduled successfully",
    });
  });

  // Check member availability
  public checkAvailability = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { orgId } = getAuthWithOrgId(req);
    const { memberId, serviceId, date } = req.query;

    if (!memberId || !serviceId || !date) {
      throw new AppError("Member ID, service ID, and date are required", 400);
    }

    const availability = await this.appointmentService.checkMemberAvailability(
      orgId,
      memberId as string,
      serviceId as string,
      date as string,
    );

    res.status(200).json({
      success: true,
      data: availability,
      message: "Availability retrieved successfully",
    });
  });

  // Get member's upcoming appointments
  public getMemberUpcomingAppointments = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { orgId } = getAuthWithOrgId(req);
    const { memberId } = req.params;
    const { days } = req.query;

    const daysNumber = days ? parseInt(days as string, 10) : 7;

    const appointments = await this.appointmentService.getMemberUpcomingAppointments(orgId, memberId, daysNumber);

    res.status(200).json({
      success: true,
      data: appointments,
      message: "Upcoming appointments retrieved successfully",
    });
  });

  // Get client's appointment history
  public getClientAppointmentHistory = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { orgId } = getAuthWithOrgId(req);
    const { clientId } = req.params;

    const appointments = await this.appointmentService.getClientAppointmentHistory(orgId, clientId);

    res.status(200).json({
      success: true,
      data: appointments,
      message: "Client appointment history retrieved successfully",
    });
  });

  // Mark appointment as completed
  public completeAppointment = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { orgId } = getAuthWithOrgId(req);
    const { id } = req.params;
    const { internalNotes } = req.body;

    const updateData = {
      status: "COMPLETED" as AppointmentStatus,
      internalNotes,
    };

    const appointment = await this.appointmentService.updateAppointment(id, orgId, updateData);

    res.status(200).json({
      success: true,
      data: appointment,
      message: "Appointment marked as completed",
    });
  });

  // Mark appointment as no-show
  public markNoShow = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { orgId } = getAuthWithOrgId(req);
    const { id } = req.params;
    const { internalNotes } = req.body;

    const updateData = {
      status: "NO_SHOW" as AppointmentStatus,
      internalNotes,
    };

    const appointment = await this.appointmentService.updateAppointment(id, orgId, updateData);

    res.status(200).json({
      success: true,
      data: appointment,
      message: "Appointment marked as no-show",
    });
  });

  // Confirm appointment
  public confirmAppointment = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { orgId } = getAuthWithOrgId(req);
    const { id } = req.params;

    const updateData = {
      status: "CONFIRMED" as AppointmentStatus,
    };

    const appointment = await this.appointmentService.updateAppointment(id, orgId, updateData);

    res.status(200).json({
      success: true,
      data: appointment,
      message: "Appointment confirmed successfully",
    });
  });

  // Start appointment (mark as in progress)
  public startAppointment = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { orgId } = getAuthWithOrgId(req);
    const { id } = req.params;

    const updateData = {
      status: "IN_PROGRESS" as AppointmentStatus,
    };

    const appointment = await this.appointmentService.updateAppointment(id, orgId, updateData);

    res.status(200).json({
      success: true,
      data: appointment,
      message: "Appointment started successfully",
    });
  });

  // Convert walk-in appointment to regular appointment with client
  public convertWalkInAppointment = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { orgId } = getAuthWithOrgId(req);
    const { id } = req.params;
    const { clientId } = req.body;

    if (!clientId) {
      throw new AppError("Client ID is required", 400);
    }

    const appointment = await this.appointmentService.convertWalkInAppointment(id, orgId, clientId);

    res.status(200).json({
      success: true,
      data: appointment,
      message: "Walk-in appointment converted to regular appointment successfully",
    });
  });

  // Analytics and Reporting Methods

  /**
   * Get appointment summary analytics
   * Provides overview of appointment trends, patterns, cancellations, and no-shows
   */
  public getAppointmentSummary = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { orgId } = getAuthWithOrgId(req);
    const params = req.query;

    const summary = await this.appointmentService.getAppointmentSummary(orgId, params);

    res.status(200).json({
      success: true,
      data: summary,
      message: "Appointment summary retrieved successfully",
    });
  });

  /**
   * Get detailed appointment list for analytics
   * Full list of scheduled appointments with filtering and sorting options
   */
  public getAppointmentAnalyticsList = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { orgId } = getAuthWithOrgId(req);
    const params = req.query;
    const pagination = parsePaginationParams(req.query);

    const appointmentList = await this.appointmentService.getAppointmentAnalyticsList(orgId, params, pagination);

    res.status(200).json({
      success: true,
      data: appointmentList.data,
      pagination: appointmentList.pagination,
      filters: appointmentList.filters,
      message: "Appointment analytics list retrieved successfully",
    });
  });

  /**
   * Get cancellations and no-shows analytics
   * Insights into appointment cancellations and no-shows with trends and patterns
   */
  public getCancellationNoShowAnalytics = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { orgId } = getAuthWithOrgId(req);
    const params = req.query;

    const analytics = await this.appointmentService.getCancellationNoShowAnalytics(orgId, params);

    res.status(200).json({
      success: true,
      data: analytics,
      message: "Cancellation and no-show analytics retrieved successfully",
    });
  });
}
