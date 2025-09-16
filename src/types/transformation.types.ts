import type { AppointmentStatus } from "@prisma/client";

// Type for appointment data with relationships for analytics transformation
export interface AppointmentAnalyticsData {
  id: string;
  memberId: string;
  serviceId: string;
  orgId: string;
  status: AppointmentStatus;
  startTime: Date;
  endTime: Date;
  duration: number;
  price: number;
  notes?: string | null;
  internalNotes?: string | null;
  cancellationReason?: string | null;
  cancelledAt?: Date | null;
  bookedByMember: {
    id: string;
    username: string;
    email: string;
  };
  cancelledByMember?: {
    id: string;
    username: string;
    email: string;
  } | null;
  walkInClientName?: string | null;
  walkInClientPhone?: string | null;
  createdAt: Date;
  updatedAt: Date;
  client?: {
    id: string;
    firstName: string;
    lastName: string;
    name?: string; // Computed field for convenience
  } | null;
  member?: {
    id: string;
    username: string;
    name?: string; // Computed field for convenience
  } | null;
  service?: {
    id: string;
    name: string;
    duration: number;
    price: number;
    category?: {
      id: string;
      name: string;
    } | null;
  } | null;
}

export interface AppointmentSummaryData {
  period: {
    start: Date;
    end: Date;
    label: string;
  };
  overview: {
    totalAppointments: number;
    totalServices: number;
    completedAppointments: number;
    cancelledAppointments: number;
    noShowAppointments: number;
    walkInAppointments: number;
    totalClients: number;
    newClients: number;
  };
  rates: {
    cancellationRate: number;
    noShowRate: number;
    completionRate: number;
    walkInRate: number;
    newClientsRate: number;
    returningClientsRate: number;
  };
  values: {
    totalAppointmentsValue: number;
    averageAppointmentValue: number;
  };
  filters: {
    memberId?: string;
    serviceId?: string;
    categoryId?: string;
  };
}
