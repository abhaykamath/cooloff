import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateItemInput, Decision, ItemRow, ItemStatus, UpdateItemInput } from '@cb/shared';
import { api } from './api';

export type Stats = {
  saved: Record<string, number>;
  spent: Record<string, number>;
  counts: Record<ItemStatus, number>;
  brokeCooldown: number;
  unpriced: number;
};

export const keys = {
  me: ['me'] as const,
  items: (statuses?: readonly ItemStatus[]) => ['items', statuses?.join(',') ?? 'all'] as const,
  item: (id: string) => ['item', id] as const,
  stats: ['stats'] as const,
};

export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: () => api<{ ok: true }>('/auth/me'),
    refetchInterval: false,
    staleTime: Infinity,
  });
}

export function useItems(statuses?: readonly ItemStatus[]) {
  const qs = statuses?.length ? `?status=${statuses.join(',')}` : '';
  return useQuery({ queryKey: keys.items(statuses), queryFn: () => api<ItemRow[]>(`/items${qs}`) });
}

export function useItem(id: string) {
  return useQuery({ queryKey: keys.item(id), queryFn: () => api<ItemRow>(`/items/${id}`) });
}

export function useStats() {
  return useQuery({ queryKey: keys.stats, queryFn: () => api<Stats>('/stats') });
}

/** After any write: refresh lists, stats and the item itself. */
function useInvalidateAll() {
  const qc = useQueryClient();
  return (item?: ItemRow) => {
    if (item) qc.setQueryData(keys.item(item.id), item);
    void qc.invalidateQueries({ queryKey: ['items'] });
    void qc.invalidateQueries({ queryKey: keys.stats });
  };
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (password: string) =>
      api<{ ok: true }>('/auth/login', { method: 'POST', body: JSON.stringify({ password }) }),
    onSuccess: () => qc.setQueryData(keys.me, { ok: true }),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ ok: true }>('/auth/logout', { method: 'POST' }),
    onSettled: () => {
      qc.clear();
      window.location.assign('/login');
    },
  });
}

export function useCreateItem() {
  const done = useInvalidateAll();
  return useMutation({
    mutationFn: (input: CreateItemInput) =>
      api<ItemRow>('/items', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: (item) => done(item),
  });
}

export function useUpdateItem(id: string) {
  const done = useInvalidateAll();
  return useMutation({
    mutationFn: (patch: UpdateItemInput) =>
      api<ItemRow>(`/items/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    onSuccess: (item) => done(item),
  });
}

export function useDecide() {
  const done = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, decision, brokeCooldown }: { id: string; decision: Decision; brokeCooldown?: boolean }) =>
      api<ItemRow>(`/items/${id}/decision`, { method: 'POST', body: JSON.stringify({ decision, brokeCooldown }) }),
    onSuccess: (item) => done(item),
    onError: () => done(),
  });
}

export function useDeleteItem() {
  const done = useInvalidateAll();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/items/${id}`, { method: 'DELETE' }),
    onSuccess: () => done(),
  });
}
