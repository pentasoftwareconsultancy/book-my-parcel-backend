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

// ─── Cursor-based pagination ──────────────────────────────────────────────────
/**
 * Cursor-based pagination — efficient for large datasets.
 *
 * Uses the last record's `id` (UUID) or `createdAt` as the cursor.
 * Much faster than OFFSET on large tables because it uses an index seek
 * instead of scanning and discarding rows.
 *
 * Usage:
 *   const { where, order, limit } = getCursorPaginationOptions({ cursor, limit: 20, direction: 'next' });
 *   const rows = await Model.findAll({ where: { ...existingWhere, ...where }, order, limit });
 *   const nextCursor = rows.length === limit ? encodeCursor(rows[rows.length - 1]) : null;
 *   const prevCursor = cursor ? encodeCursor(rows[0]) : null;
 */
import { Op } from "sequelize";

/**
 * Encode a cursor from a record (uses createdAt + id for stable ordering).
 */
export function encodeCursor(record) {
  const payload = JSON.stringify({ id: record.id, createdAt: record.createdAt });
  return Buffer.from(payload).toString("base64url");
}

/**
 * Decode a cursor back to { id, createdAt }.
 */
export function decodeCursor(cursor) {
  try {
    return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

/**
 * Build Sequelize where + order options for cursor pagination.
 *
 * @param {object} options
 * @param {string} [options.cursor]     - Encoded cursor from previous page
 * @param {number} [options.limit=20]   - Page size (max 100)
 * @param {'next'|'prev'} [options.direction='next']
 * @returns {{ where: object, order: Array, limit: number }}
 */
export function getCursorPaginationOptions({ cursor, limit = 20, direction = "next" } = {}) {
  const safeLimit = Math.min(Math.max(1, parseInt(limit) || 20), 100);
  const isNext = direction !== "prev";

  let where = {};
  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (decoded?.createdAt) {
      // Records created strictly before/after the cursor's createdAt,
      // OR at the same time but with a different id (tie-break).
      const op = isNext ? Op.lt : Op.gt;
      where = {
        [Op.or]: [
          { createdAt: { [op]: new Date(decoded.createdAt) } },
          {
            createdAt: new Date(decoded.createdAt),
            id: { [isNext ? Op.lt : Op.gt]: decoded.id },
          },
        ],
      };
    }
  }

  const order = [
    ["createdAt", isNext ? "DESC" : "ASC"],
    ["id",        isNext ? "DESC" : "ASC"],
  ];

  return { where, order, limit: safeLimit };
}

/**
 * Build the pagination meta object for cursor-based responses.
 */
export function getCursorPaginationMeta(rows, requestedLimit) {
  const hasMore = rows.length === requestedLimit;
  return {
    next_cursor: hasMore ? encodeCursor(rows[rows.length - 1]) : null,
    prev_cursor: rows.length > 0 ? encodeCursor(rows[0]) : null,
    has_more:    hasMore,
    count:       rows.length,
  };
}