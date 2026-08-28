export const defaultPageSize = 25;
export const maximumPageSize = 250;
export const minimumPageSize = 1;
export const pageSizeOptions = [10, 25, 50, 100] as const;

export type PaginationWindow = {
  end: number;
  page: number;
  pageCount: number;
  sliceEnd: number;
  sliceStart: number;
  start: number;
  total: number;
};

export function parsePageSize(value: string | null) {
  if (!value?.trim()) {
    return null;
  }

  const pageSize = Number(value);

  if (
    !Number.isInteger(pageSize) ||
    pageSize < minimumPageSize ||
    pageSize > maximumPageSize
  ) {
    return null;
  }

  return pageSize;
}

export function getPaginationWindow(
  total: number,
  requestedPage: number,
  pageSize: number,
): PaginationWindow {
  const safeTotal = Math.max(0, Math.floor(total));
  const safePageSize = parsePageSize(String(pageSize)) ?? defaultPageSize;
  const pageCount = Math.max(1, Math.ceil(safeTotal / safePageSize));
  const page = Math.min(
    pageCount,
    Math.max(1, Math.floor(requestedPage) || 1),
  );
  const sliceStart = (page - 1) * safePageSize;
  const sliceEnd = Math.min(sliceStart + safePageSize, safeTotal);

  return {
    end: safeTotal === 0 ? 0 : sliceEnd,
    page,
    pageCount,
    sliceEnd,
    sliceStart,
    start: safeTotal === 0 ? 0 : sliceStart + 1,
    total: safeTotal,
  };
}

export function paginateItems<T>(
  items: readonly T[],
  requestedPage: number,
  pageSize: number,
) {
  const window = getPaginationWindow(items.length, requestedPage, pageSize);

  return {
    items: items.slice(window.sliceStart, window.sliceEnd),
    window,
  };
}

export function resetPageForCriteriaChange(pageSize: number) {
  return {
    page: 1,
    pageSize,
  };
}
