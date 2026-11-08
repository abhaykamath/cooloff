export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
  }
}

/** Fetch wrapper for same-origin /api calls (proxied to the Hono backend). */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  const body = res.status === 204 ? undefined : await res.json().catch(() => undefined);

  if (!res.ok) {
    const message = (body as { error?: string } | undefined)?.error ?? res.statusText;
    throw new ApiError(res.status, message, body);
  }
  return body as T;
}
