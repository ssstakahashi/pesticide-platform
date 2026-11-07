import { queryOptions } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api';

/** ログイン中の利用者に属するデータのキー。アカウントが切り替わったらまとめて破棄する */
export const meKey = ['me'] as const;
export const seasonsKey = [...meKey, 'seasons'] as const;
export const recordsKey = (seasonId: string) => [...seasonsKey, seasonId, 'records'] as const;

export const meQuery = (enabled: boolean) =>
  queryOptions({
    queryKey: meKey,
    queryFn: async () => unwrap(await api.api.me.$get()),
    enabled,
    staleTime: 60_000,
  });

export const seasonsQuery = (enabled: boolean) =>
  queryOptions({
    queryKey: seasonsKey,
    queryFn: async () => (await unwrap(await api.api.me.seasons.$get())).items,
    enabled,
  });

export const recordsQuery = (seasonId: string | undefined) =>
  queryOptions({
    queryKey: recordsKey(seasonId ?? ''),
    queryFn: async () =>
      (await unwrap(await api.api.me.seasons[':id'].records.$get({ param: { id: seasonId! } }))).items,
    enabled: Boolean(seasonId),
  });
