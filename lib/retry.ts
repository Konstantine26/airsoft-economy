// Airsoft Economy: transparent retry for transient network failures.
//
// Scope, deliberately: this handles "weak/dropping signal on the
// polygon" (a request fails, retrying a moment later succeeds) -- it does
// NOT queue actions while fully offline and replay them later. That's a
// materially bigger problem (persistence across app restarts, conflict
// resolution, a sync-status UI) and wasn't what this was scoped to solve.
// No @react-native-community/netinfo or similar dependency needed: this
// doesn't check connectivity status ahead of time, it just retries
// whatever request actually failed for a network-shaped reason.
//
// supabase-js resolves with { data: null, error } rather than throwing
// for a failed fetch, so that's the common case this checks for -- the
// try/catch is defensive in case a given call ever does throw.

type Result<T> = { data?: T | null; error: { message: string } | null };

function isTransientError(message: string): boolean {
  return /network|fetch|timeout|timed out|econnreset|econnrefused|enotfound|failed to fetch/i.test(message);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  run: () => PromiseLike<Result<T>>,
  options?: { retries?: number; baseDelayMs?: number }
): Promise<Result<T>> {
  const retries = options?.retries ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 800;

  let lastResult: Result<T> = { data: null, error: { message: 'retry: no attempt made' } };

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      lastResult = await run();
    } catch (e) {
      lastResult = { data: null, error: { message: e instanceof Error ? e.message : 'Unknown error' } };
    }

    if (!lastResult.error || !isTransientError(lastResult.error.message)) {
      return lastResult;
    }
    if (attempt < retries) {
      await sleep(baseDelayMs * 2 ** attempt);
    }
  }

  return lastResult;
}
