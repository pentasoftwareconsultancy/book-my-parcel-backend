// utils/pagination.js

// 1. Pagination calculator
export function getPagination(page = 1, limit = 10) {
  const parsedPage = Math.max(parseInt(page) || 1, 1);
  const parsedLimit = Math.max(parseInt(limit) || 10, 1);

  const offset = (parsedPage - 1) * parsedLimit;

  return {
    page: parsedPage,
    limit: parsedLimit,
    offset,
  };
}

// 2. Pagination response formatter
export function getPagingData({ count, rows }, page, limit) {
  return {
    total: count,
    page: parseInt(page),
    limit: parseInt(limit),
    totalPages: Math.ceil(count / limit),
    data: rows,
  };
}