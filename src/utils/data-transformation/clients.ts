import type { ClientTableRow, TableColumn } from "@/types/table.types";
import { Client, Appointment } from "@prisma/client";

// Type for Client with appointments included
type ClientWithAppointments = Client & {
  appointments: Appointment[];
  referredBy?: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
};

export const DEFAULT_APPOINTMENT_COLUMNS: TableColumn[] = [
  {
    key: "client",
    label: "Client",
    type: "link",
    sortable: true,
    filterable: false,
  },
  {
    key: "gender",
    label: "Gender",
    type: "text",
    sortable: true,
    filterable: true,
  },
  {
    key: "age",
    label: "Age",
    type: "number",
    sortable: true,
    filterable: false,
  },
  {
    key: "mobileNumber",
    label: "Mobile Number",
    type: "text",
    sortable: true,
    filterable: false,
  },
  {
    key: "email",
    label: "Email",
    type: "text",
    sortable: true,
    filterable: false,
  },
  {
    key: "addedOn",
    label: "Added On",
    type: "date",
    sortable: true,
    filterable: false,
  },
  {
    key: "firstAppointmentDate",
    label: "First Appt.",
    type: "date",
    sortable: true,
    filterable: false,
  },
  {
    key: "lastAppointmentDate",
    label: "Last Appt.",
    type: "date",
    sortable: true,
    filterable: false,
  },
  {
    key: "loyaltyPoints",
    label: "Loyalty Points",
    type: "number",
    sortable: true,
    filterable: false,
  },
  {
    key: "clientSource",
    label: "Client Source",
    type: "text",
    sortable: true,
    filterable: true,
  },
  {
    key: "referredBy",
    label: "Referred By",
    type: "text",
    sortable: true,
    filterable: false,
  },
];

// Get columns based on include/exclude preferences
export const getClientTableColumns = (includeFields?: string[], excludeFields?: string[]): TableColumn[] => {
  let columns = [...DEFAULT_APPOINTMENT_COLUMNS];

  if (excludeFields?.length) {
    columns = columns.filter((col) => !excludeFields.includes(col.key));
  }

  if (includeFields?.length) {
    columns = columns.filter((col) => includeFields.includes(col.key));
  }

  return columns;
};

export const transformClientToTableRow = (client: ClientWithAppointments): ClientTableRow => ({
  client: {
    id: client.id as string,
    name: `${client.firstName} ${client.lastName}`.trim() || "Walk-in",
  },
  gender: client.gender,
  age: client?.dateOfBirth
    ? Math.floor((new Date().getTime() - new Date(client.dateOfBirth).getTime()) / (1000 * 60 * 60 * 24 * 365.25))
    : null,
  mobileNumber: client.phone ?? null,
  email: client.email,
  addedOn: client.createdAt ? new Date(client.createdAt).toLocaleDateString("en-US") : null,
  firstAppointmentDate:
    client.appointments && client.appointments.length
      ? new Date(client.appointments[0].startTime).toLocaleDateString("en-US")
      : null,
  lastAppointmentDate:
    client.appointments && client.appointments.length
      ? new Date(client.appointments[client.appointments.length - 1].startTime).toLocaleDateString("en-US")
      : null,
  loyaltyPoints: 0,
  clientSource: client.clientSource,
  referredBy: client?.referredBy
    ? {
        id: client.referredBy.id,
        name: `${client.referredBy.firstName} ${client.referredBy.lastName}`.trim() || "Walk-in",
      }
    : null,
});

// Transform multiple appointments to table data
export const transformClientsReportToTableData = (clients: ClientWithAppointments[]): ClientTableRow[] => {
  return clients.map(transformClientToTableRow);
};
