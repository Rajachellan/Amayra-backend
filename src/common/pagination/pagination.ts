export type PaginationInput = {
  page?: number;
  limit?: number;
  maxLimit?: number;
};

export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
};

export function normalizePagination(input: PaginationInput): {
  page: number;
  limit: number;
  skip: number;
} {
  const maxLimit = input.maxLimit ?? 100;
  const page = Math.max(1, Number(input.page) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Number(input.limit) || 20));
  return { page, limit, skip: (page - 1) * limit };
}

export function buildPaginationMeta(total: number, page: number, limit: number): PaginationMeta {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}
