import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CropSeasonInput, SprayRecordInput } from '@pesticide/api-contract';
import { api, unwrap } from '@/lib/api';
import { meKey } from './queries';

/** 作付けや記録を変えたら、件数（/api/me）も含めて取り直す */
function useInvalidateMe() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: meKey });
}

export function useCreateSeason() {
  const invalidate = useInvalidateMe();
  return useMutation({
    mutationFn: async (input: CropSeasonInput) => unwrap(await api.api.me.seasons.$post({ json: input })),
    onSuccess: invalidate,
  });
}

export function useUpdateSeason() {
  const invalidate = useInvalidateMe();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: CropSeasonInput }) =>
      unwrap(await api.api.me.seasons[':id'].$put({ param: { id }, json: input })),
    onSuccess: invalidate,
  });
}

export function useDeleteSeason() {
  const invalidate = useInvalidateMe();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await api.api.me.seasons[':id'].$delete({ param: { id } })),
    onSuccess: invalidate,
  });
}

export function useCreateRecords() {
  const invalidate = useInvalidateMe();
  return useMutation({
    mutationFn: async ({ seasonId, records }: { seasonId: string; records: SprayRecordInput[] }) =>
      unwrap(await api.api.me.seasons[':id'].records.$post({ param: { id: seasonId }, json: { records } })),
    onSuccess: invalidate,
  });
}

export function useDeleteRecord() {
  const invalidate = useInvalidateMe();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await api.api.me.records[':id'].$delete({ param: { id } })),
    onSuccess: invalidate,
  });
}
