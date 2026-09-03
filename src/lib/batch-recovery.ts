export type BatchRecoveryResult<R> = { results: R[]; retries: number; splits: number };

/**
 * Retry a failed batch, then bisect it so one malformed item cannot discard
 * every otherwise valid result in the batch.
 */
export async function runWithBatchRecovery<T, R>(
  values: T[],
  operation: (batch: T[]) => Promise<R>,
  options: { attempts?: number } = {},
): Promise<BatchRecoveryResult<R>> {
  const attempts = Math.max(1, options.attempts ?? 2);
  let retries = 0;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return { results: [await operation(values)], retries, splits: 0 };
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) retries++;
    }
  }
  if (values.length <= 1) throw lastError;
  const middle = Math.ceil(values.length / 2);
  // Keep recovery sequential. Parallel model runners can exhaust VRAM on
  // consumer GPUs precisely while recovering from a failed large batch.
  const left = await runWithBatchRecovery(values.slice(0, middle), operation, options);
  const right = await runWithBatchRecovery(values.slice(middle), operation, options);
  return {
    results: [...left.results, ...right.results],
    retries: retries + left.retries + right.retries,
    splits: 1 + left.splits + right.splits,
  };
}
