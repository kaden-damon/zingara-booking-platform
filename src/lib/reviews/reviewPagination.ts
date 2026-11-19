export function getReviewPageCount(total: number, pageSize: number) {
  return Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, pageSize)));
}

export function clampReviewPage(page: number, total: number, pageSize: number) {
  return Math.min(Number.isSafeInteger(page) ? Math.max(1, page) : 1, getReviewPageCount(total, pageSize));
}
