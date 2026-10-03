'use client';

import { useQuery } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api';

/** Document master data hooks (M04 §10). */
export function useDisciplines(includeInactive = false) {
  return useQuery({
    queryKey: ['disciplines', includeInactive],
    queryFn: async () =>
      unwrap(await api.GET('/api/v1/disciplines', { params: { query: { includeInactive } } })),
    staleTime: 10 * 60_000,
  });
}

export function useDocumentTypes(includeInactive = false) {
  return useQuery({
    queryKey: ['document-types', includeInactive],
    queryFn: async () =>
      unwrap(await api.GET('/api/v1/document-types', { params: { query: { includeInactive } } })),
    staleTime: 10 * 60_000,
  });
}

export function useTemplates(includeInactive = false) {
  return useQuery({
    queryKey: ['workflow-templates', includeInactive],
    queryFn: async () =>
      unwrap(
        await api.GET('/api/v1/workflow-templates', { params: { query: { includeInactive } } }),
      ),
    staleTime: 10 * 60_000,
  });
}
