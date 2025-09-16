import type { AppointmentStatus } from "@prisma/client";
import { AppointmentAnalyticsData, AppointmentSummaryData } from "@/types/transformation.types";
import type {
  TableColumn,
  AppointmentTableRow,
  TableFilters,
  AppointmentAnalyticsQuery,
  AppointmentSummaryTableRow,
} from "@/types/table.types";

const appointmentDateFormatOptions: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
};

// Table column definitions for UI rendering
export const DEFAULT_APPOINTMENT_COLUMNS: TableColumn[] = [
  {
    key: "id",
    label: "Appt. ref",
    type: "link",
    sortable: true,
    filterable: false,
  },
  {
    key: "client",
    label: "Client",
    type: "link",
    sortable: true,
    filterable: true,
  },
  {
    key: "member",
    label: "Team Member",
    type: "link",
    sortable: true,
    filterable: true,
  },
  {
    key: "status",
    label: "Status",
    type: "status",
    sortable: true,
    filterable: true,
  },
  {
    key: "createdAt",
    label: "Created",
    type: "date",
    sortable: true,
    filterable: false,
  },
  {
    key: "scheduledAt",
    label: "Scheduled At",
    type: "date",
    sortable: true,
    filterable: true,
  },
  {
    key: "category",
    label: "Category",
    type: "text",
    sortable: true,
    filterable: true,
  },
  {
    key: "service",
    label: "Service",
    type: "text",
    sortable: true,
    filterable: true,
  },
  {
    key: "duration",
    label: "Duration",
    type: "number",
    sortable: true,
    filterable: false,
  },
  {
    key: "appointmentSlot",
    label: "Appointment Slot",
    type: "text",
    sortable: false,
    filterable: false,
  },
  {
    key: "price",
    label: "Price",
    type: "currency",
    sortable: true,
    filterable: false,
  },
  {
    key: "notes",
    label: "Notes",
    type: "text",
    sortable: false,
    filterable: false,
  },
  {
    key: "createdBy",
    label: "Created By",
    type: "link",
    sortable: false,
    filterable: false,
  },
  {
    key: "cancelledBy",
    label: "Cancelled By",
    type: "link",
    sortable: false,
    filterable: false,
  },
];

export const DEFAULT_APPOINTMENT_SUMMARY_COLUMNS: TableColumn[] = [
  {
    key: "Location",
    label: "Location",
    type: "text",
    sortable: true,
    filterable: true,
  },
  {
    key: "appointments",
    label: "Appointments",
    type: "number",
    sortable: true,
    filterable: false,
  },
  {
    key: "services",
    label: "Services",
    type: "number",
    sortable: true,
    filterable: false,
  },
  {
    key: "requested",
    label: "Requested",
    type: "number",
    sortable: true,
    filterable: false,
  },
  {
    key: "totalAppointmentValue",
    label: "Total appt. value",
    type: "currency",
    sortable: true,
    filterable: false,
  },
  {
    key: "averageAppointmentValue",
    label: "Avg. appt. value",
    type: "currency",
    sortable: true,
    filterable: false,
  },
  {
    key: "online",
    label: "% online",
    type: "percentage",
    sortable: true,
    filterable: false,
  },
  {
    key: "cancelled",
    label: "% cancelled",
    type: "percentage",
    sortable: true,
    filterable: false,
  },
  {
    key: "noShow",
    label: "% no show",
    type: "percentage",
    sortable: true,
    filterable: false,
  },
  {
    key: "Total Clients",
    label: "Total Clients",
    type: "number",
    sortable: true,
    filterable: false,
  },
  {
    key: "New Clients",
    label: "New Clients",
    type: "number",
    sortable: true,
    filterable: false,
  },
  {
    key: "newClientsRate",
    label: "% new clients",
    type: "percentage",
    sortable: true,
    filterable: false,
  },
  {
    key: "returningClients",
    label: "% returning Clients",
    type: "percentage",
    sortable: true,
    filterable: false,
  },
];

// Transform raw appointment data to table rows
export const transformAppointmentToTableRow = (appointment: AppointmentAnalyticsData): AppointmentTableRow => ({
  id: appointment.id,
  client: {
    id: appointment.client?.id || "walk-in",
    name: appointment.walkInClientName
      ? `Walk-in: ${appointment.walkInClientName}`
      : appointment.client
        ? `${appointment.client.firstName} ${appointment.client.lastName}`.trim()
        : "Unknown Client",
  },
  member: {
    id: appointment.member?.id || "unassigned",
    name: appointment.member?.username || "Unassigned",
  },
  status: appointment.status,
  createdAt: appointment.createdAt.toLocaleString("en-US", appointmentDateFormatOptions),
  scheduledAt: appointment.startTime.toLocaleString("en-US", appointmentDateFormatOptions),
  cancelledAt: appointment.cancelledAt
    ? appointment.cancelledAt.toLocaleString("en-US", appointmentDateFormatOptions)
    : undefined,
  category: appointment.service?.category?.name || "Uncategorized",
  service: appointment.service?.name || "Unknown Service",
  duration: appointment.service?.duration || appointment.duration || 0,
  appointmentSlot: `${appointment.startTime.toLocaleString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })} - ${appointment.endTime.toLocaleString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })}`,
  createdBy: {
    id: appointment.bookedByMember.id,
    name: appointment.bookedByMember?.username || "Unknown",
  },
  cancelledBy: {
    id: appointment.cancelledByMember?.id || "",
    name: appointment.cancelledByMember?.username || "Unknown",
  },
  price: appointment.service?.price || appointment.price || 0,
  notes: appointment.notes || appointment.internalNotes || "",
});

export const transformAppointmentSummaryToTableRow = (summary: AppointmentSummaryData): AppointmentSummaryTableRow => ({
  location: "-",
  appointments: summary.overview.totalAppointments,
  services: summary.overview.totalServices,
  totalAppointmentValue: summary.values.totalAppointmentsValue,
  averageAppointmentValue: summary.values.averageAppointmentValue,
  requested: 0,
  online: 0,
  cancelled: summary.rates.cancellationRate,
  noShow: summary.rates.noShowRate,
  totalClients: summary.overview.totalClients,
  newClients: summary.overview.newClients,
  newClientsRate: summary.rates.newClientsRate,
  returningClients: summary.rates.returningClientsRate,
});

export const transformAppointmentSummariesToTableData = (
  summaries: AppointmentSummaryData[],
): AppointmentSummaryTableRow[] => {
  return summaries.map(transformAppointmentSummaryToTableRow);
};

// Transform multiple appointments to table data
export const transformAppointmentsToTableData = (appointments: AppointmentAnalyticsData[]): AppointmentTableRow[] => {
  return appointments.map(transformAppointmentToTableRow);
};

// Get columns based on include/exclude preferences
export const getAppointmentTableColumns = (includeFields?: string[], excludeFields?: string[]): TableColumn[] => {
  let columns = [...DEFAULT_APPOINTMENT_COLUMNS];

  if (excludeFields?.length) {
    columns = columns.filter((col) => !excludeFields.includes(col.key));
  }

  if (includeFields?.length) {
    columns = columns.filter((col) => includeFields.includes(col.key));
  }

  return columns;
};

export const getAppointmentSummaryTableColumns = (
  includeFields?: string[],
  excludeFields?: string[],
): TableColumn[] => {
  let columns = [...DEFAULT_APPOINTMENT_SUMMARY_COLUMNS];

  if (excludeFields?.length) {
    columns = columns.filter((col) => !excludeFields.includes(col.key));
  }

  if (includeFields?.length) {
    columns = columns.filter((col) => includeFields.includes(col.key));
  }

  return columns;
};

// Generate available filter options from appointment data
export const generateAppointmentFilters = (appointments: AppointmentAnalyticsData[]): TableFilters["available"] => {
  const uniqueMembers = [
    ...new Set(appointments.map((a) => a.member?.username).filter((username): username is string => Boolean(username))),
  ].sort();

  const uniqueServices = [
    ...new Set(appointments.map((a) => a.service?.name).filter((name): name is string => Boolean(name))),
  ].sort();

  const uniqueCategories = [
    ...new Set(appointments.map((a) => a.service?.category?.name).filter((name): name is string => Boolean(name))),
  ].sort();

  const uniqueStatuses = [...new Set(appointments.map((a) => a.status))] as AppointmentStatus[];

  const dates = appointments.map((a) => new Date(a.startTime)).filter((d) => !isNaN(d.getTime()));

  const minDate = dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))) : null;
  const maxDate = dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null;

  return {
    members: uniqueMembers,
    services: uniqueServices,
    categories: uniqueCategories,
    statuses: uniqueStatuses,
    dateRange: {
      min: minDate?.toISOString().split("T")[0] || null,
      max: maxDate?.toISOString().split("T")[0] || null,
    },
  };
};

// Extract applied filters from query parameters
export const extractAppliedAppointmentFilters = (
  params: AppointmentAnalyticsQuery,
): Record<string, string | number | boolean | string[]> => {
  const applied: Record<string, string | number | boolean | string[]> = {};

  if (params.clientId) applied.clientId = params.clientId;
  if (params.memberId) applied.memberId = params.memberId;
  if (params.serviceId) applied.serviceId = params.serviceId;
  if (params.categoryId) applied.categoryId = params.categoryId;
  if (params.status) applied.status = params.status;
  if (params.startDate) applied.startDate = params.startDate;
  if (params.endDate) applied.endDate = params.endDate;
  if (params.search) applied.search = params.search;
  if (params.isWalkIn !== undefined) applied.isWalkIn = params.isWalkIn;
  if (params.includeFields) applied.includeFields = params.includeFields;
  if (params.excludeFields) applied.excludeFields = params.excludeFields;

  return applied;
};
