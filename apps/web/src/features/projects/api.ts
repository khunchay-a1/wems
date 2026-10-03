'use client';

import type { Dto } from '@wems/api-contract';
import { useQuery } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api';

export type Project = Dto<'ProjectDto'>;

export function useProject(id: string) {
  return useQuery({
    queryKey: ['project', id],
    queryFn: async () =>
      unwrap(await api.GET('/api/v1/projects/{id}', { params: { path: { id } } })),
  });
}

export function useProjectMembers(id: string) {
  return useQuery({
    queryKey: ['project', id, 'members'],
    queryFn: async () =>
      unwrap(await api.GET('/api/v1/projects/{id}/members', { params: { path: { id } } })),
  });
}

export const PROJECT_TYPES = [
  'DESIGN',
  'DESIGN_BUILD',
  'CONSTRUCTION',
  'OPERATION_MAINTENANCE',
  'MONITORING',
  'CONSULTING',
  'OTHER',
] as const;
export const PROJECT_STATUSES = [
  'PLANNING',
  'ACTIVE',
  'ON_HOLD',
  'COMPLETED',
  'CLOSED',
  'CANCELLED',
] as const;
export const PROJECT_ROLES = [
  'PROJECT_MANAGER',
  'DESIGN_MANAGER',
  'ENGINEER',
  'DRAFTER',
  'DOCUMENT_CONTROLLER',
  'SITE_ENGINEER',
  'FOREMAN',
  'VIEWER',
] as const;
