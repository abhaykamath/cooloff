import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { ApiError } from './api';

/** Session expired or missing → back to the login page (unless already there). */
function onAuthError(err: unknown) {
  if (err instanceof ApiError && err.status === 401 && window.location.pathname !== '/login') {
    window.location.assign('/login');
  }
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onAuthError }),
  mutationCache: new MutationCache({ onError: onAuthError }),
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      refetchInterval: 30_000, // pick up links saved from Telegram on another device (PRD §9)
      refetchOnWindowFocus: true,
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
    },
  },
});
