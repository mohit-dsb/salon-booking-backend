import type { AppointmentStatus } from "@prisma/client";

// Type for appointment data with relationships for analytics transformation
export interface AppointmentAnalyticsData {
  id: string;
  clientId?: string | null;
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
  bookedBy: string;
  cancelledBy?: string | null;
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
  bookedByMember?: {
    id: string;
    username: string;
    name?: string; // Computed field for convenience
  } | null;
  cancelledByMember?: {
    id: string;
    username: string;
    name?: string; // Computed field for convenience
  } | null;
}
