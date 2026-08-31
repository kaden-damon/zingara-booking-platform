type CancellationUiFlowOptions<T> = {
  mutate: () => Promise<T>;
  onAuthoritativeFailure: (error: unknown) => void;
  onAuthoritativeSuccess: (result: T) => void;
  onRefreshFailure?: (error: unknown) => void;
  refreshAfterSuccess?: (result: T) => Promise<void>;
};

export async function runCancellationUiFlow<T>({
  mutate,
  onAuthoritativeFailure,
  onAuthoritativeSuccess,
  onRefreshFailure,
  refreshAfterSuccess,
}: CancellationUiFlowOptions<T>) {
  let result: T;

  try {
    result = await mutate();
  } catch (error) {
    onAuthoritativeFailure(error);
    return false;
  }

  onAuthoritativeSuccess(result);

  if (refreshAfterSuccess) {
    try {
      await refreshAfterSuccess(result);
    } catch (error) {
      onRefreshFailure?.(error);
    }
  }

  return true;
}
