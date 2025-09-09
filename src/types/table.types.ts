import type { AppointmentStatus } from "@prisma/client";

// Table column definition for UI rendering
export interface TableColumn {
  key: string;
  label: string;
  type: "text" | "date" | "number" | "status" | "currency" | "boolean";
  sortable: boolean;
  filterable: boolean;
  format?: (value: unknown) => string;
}

// Appointment table row structure
export interface AppointmentTableRow {
  id: string;
  client: string;
  member: string;
  service: string;
  category: string;
  status: AppointmentStatus;
  scheduledAt: string;
  duration: number;
  appointmentSlot: string;
  price: number;
  notes?: string;
  createdAt: string;
  cancelledBy?: string;
  createdBy: string;
  cancelledAt?: string;
}

// Pagination metadata
export interface TablePagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// Filter definitions
export interface TableFilters {
  applied: Record<string, string | number | boolean | string[]>;
  available: {
    members: string[];
    services: string[];
    categories: string[];
    statuses: AppointmentStatus[];
    dateRange: {
      min: string | null;
      max: string | null;
    };
  };
}

// Metadata for the table
export interface TableMetadata {
  totalRecords: number;
  filteredRecords: number;
  lastUpdated: string;
  queryTime: number;
}

// Complete table response structure
export interface TableResponse<T = AppointmentTableRow> {
  tableData: T[];
  columns: TableColumn[];
  pagination: TablePagination;
  filters: TableFilters;
  metadata: TableMetadata;
}

// Query parameters for analytics
export interface AppointmentAnalyticsQuery {
  includeFields?: string[];
  excludeFields?: string[];
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  clientId?: string;
  memberId?: string;
  serviceId?: string;
  categoryId?: string;
  status?: AppointmentStatus;
  startDate?: string;
  endDate?: string;
  search?: string;
  isWalkIn?: boolean;
}
