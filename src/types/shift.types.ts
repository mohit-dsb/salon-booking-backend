// Shift type definitions and interfaces

export interface CreateShiftData {
  memberId: string;
  date: string; // YYYY-MM-DD format
  startTime: string; // HH:MM format
  endTime: string; // HH:MM format
  title?: string;
  description?: string;
  color?: string;
  breaks?: BreakPeriod[];
  isRecurring?: boolean;
  recurrencePattern?: "DAILY" | "WEEKLY" | "BI_WEEKLY" | "MONTHLY" | "CUSTOM";
  parentShiftId?: string;
}

export interface UpdateShiftData {
  date?: string;
  startTime?: string;
  endTime?: string;
  title?: string;
  description?: string;
  color?: string;
  status?: "SCHEDULED" | "CONFIRMED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  breaks?: BreakPeriod[];
}

export interface BreakPeriod {
  startTime: string; // HH:MM format
  endTime: string; // HH:MM format
  title?: string; // e.g., "Lunch", "Coffee Break"
}

export interface ShiftFilters {
  memberId?: string;
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  status?: "SCHEDULED" | "CONFIRMED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  includeRecurring?: boolean;
}

export interface ShiftWithDetails {
  id: string;
  memberId: string;
  orgId: string;
  date: Date;
  startTime: string;
  endTime: string;
  duration: number;
  title: string | null;
  description: string | null;
  color: string | null;
  status: string;
  breaks?: BreakPeriod[] | null;
  isRecurring: boolean;
  recurrencePattern?: string | null;
  parentShiftId?: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  member: {
    id: string;
    username: string;
    email: string;
    profileImage?: string | null;
  };
  createdByMember: {
    id: string;
    username: string;
  };
}

export interface WeeklySchedule {
  weekStart: string; // YYYY-MM-DD
  weekEnd: string; // YYYY-MM-DD
  days: DaySchedule[];
}

export interface DaySchedule {
  date: string; // YYYY-MM-DD
  dayName: string; // Monday, Tuesday, etc.
  shifts: ShiftWithDetails[];
  totalHours: number;
}

export interface ShiftStats {
  totalShifts: number;
  scheduledShifts: number;
  confirmedShifts: number;
  completedShifts: number;
  cancelledShifts: number;
  totalHours: number;
  averageShiftDuration: number;
}

export interface RecurringShiftOptions {
  pattern: "DAILY" | "WEEKLY" | "BI_WEEKLY" | "MONTHLY" | "CUSTOM";
  endDate?: string; // When to stop creating recurring shifts
  maxOccurrences?: number; // Maximum number of shifts to create
  customPattern?: {
    interval: number; // Repeat every N days/weeks/months
    daysOfWeek?: number[]; // For weekly patterns: [1,2,3,4,5] = Mon-Fri
  };
}
