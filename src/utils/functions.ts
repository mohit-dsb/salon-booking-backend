import type { CancellationReason } from "@prisma/client";

export const mapCancellationReason = (reason: string): CancellationReason => {
  const normalizedReason = reason.toLowerCase().trim();

  switch (normalizedReason) {
    case "no reason provided":
      return "NO_REASON_PROVIDED";
    case "duplicate appointment":
      return "DUPLICATE_APPOINTMENT";
    case "appointment made by mistake":
      return "APPOINTMENT_MADE_BY_MISTAKE";
    case "client not available":
      return "CLIENT_NOT_AVAILABLE";
    default:
      // Default to NO_REASON_PROVIDED for unknown reasons
      return "NO_REASON_PROVIDED";
  }
};

export const reverseMapCancellationReason = (reason: CancellationReason): string => {
  switch (reason) {
    case "NO_REASON_PROVIDED":
      return "No reason provided";
    case "DUPLICATE_APPOINTMENT":
      return "Duplicate appointment";
    case "APPOINTMENT_MADE_BY_MISTAKE":
      return "Appointment made by mistake";
    case "CLIENT_NOT_AVAILABLE":
      return "Client not available";
    default:
      return "No reason provided";
  }
};
