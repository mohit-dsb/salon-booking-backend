// Pagination types and utilities
export interface PaginationQuery {
  page?: string;
  limit?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
  sortBy: string;
  sortOrder: "asc" | "desc";
}

export interface PaginationMeta {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  meta: PaginationMeta;
}

// Default pagination constants
export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 100;
export const MIN_LIMIT = 1;

// Parse and validate pagination parameters
export const parsePaginationParams = (query: PaginationQuery, defaultSortBy = "createdAt"): PaginationParams => {
  // Parse page
  let page = parseInt(query.page || DEFAULT_PAGE.toString(), 10);
  if (isNaN(page) || page < 1) {
    page = DEFAULT_PAGE;
  }

  // Parse limit
  let limit = parseInt(query.limit || DEFAULT_LIMIT.toString(), 10);
  if (isNaN(limit) || limit < MIN_LIMIT) {
    limit = DEFAULT_LIMIT;
  }
  if (limit > MAX_LIMIT) {
    limit = MAX_LIMIT;
  }

  // Calculate skip
  const skip = (page - 1) * limit;

  // Parse sort parameters
  const sortBy = query.sortBy || defaultSortBy;
  const sortOrder = query.sortOrder === "desc" ? "desc" : "asc";

  return {
    page,
    limit,
    skip,
    sortBy,
    sortOrder,
  };
};

// Create pagination metadata
export const createPaginationMeta = (totalItems: number, currentPage: number, itemsPerPage: number): PaginationMeta => {
  const totalPages = Math.ceil(totalItems / itemsPerPage);

  return {
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage,
    hasNextPage: currentPage < totalPages,
    hasPreviousPage: currentPage > 1,
  };
};

// Create paginated response
export const createPaginatedResponse = <T>(
  data: T[],
  totalItems: number,
  currentPage: number,
  itemsPerPage: number,
): PaginatedResponse<T> => {
  const meta = createPaginationMeta(totalItems, currentPage, itemsPerPage);

  return {
    success: true,
    data,
    meta,
  };
};
