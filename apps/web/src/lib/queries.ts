import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import { api, unwrap } from './api';

export type SearchParams = { crop?: string; pest?: string; category?: string };
export type SuggestKind = 'crops' | 'pests' | 'pesticides';

export const pesticideSearchQuery = ({ crop, pest, category }: SearchParams) =>
  queryOptions({
    queryKey: ['pesticides', 'search', { crop, pest, category }],
    queryFn: async () => unwrap(await api.api.pesticides.search.$get({ query: { crop: crop ?? '', pest, category } })),
    enabled: Boolean(crop),
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });

export const suggestQuery = (kind: SuggestKind, q: string) =>
  queryOptions({
    queryKey: [kind, 'suggest', q],
    queryFn: async () => unwrap(await api.api[kind].suggest.$get({ query: { q, limit: '10' } })),
    enabled: q.trim().length > 0,
    staleTime: 10 * 60_000,
    placeholderData: keepPreviousData,
  });
