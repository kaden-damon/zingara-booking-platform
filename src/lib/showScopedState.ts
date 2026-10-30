export function replaceShowScopedRows<T extends { showId?: string | null }>(
  currentRows: T[],
  nextRows: T[],
  requestedShowIds: string[],
) {
  const refreshedShowIds = new Set([
    ...requestedShowIds,
    ...nextRows.flatMap((row) => (row.showId ? [row.showId] : [])),
  ]);

  return [
    ...currentRows.filter(
      (row) => !row.showId || !refreshedShowIds.has(row.showId),
    ),
    ...nextRows,
  ];
}
