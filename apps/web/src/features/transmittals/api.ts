'use client';

import type { Dto } from '@wems/api-contract';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api';

export type Transmittal = Dto<'TransmittalDto'>;
export type TransmittalItem = Dto<'TransmittalItemDto'>;
export type DeliveryMethod = Transmittal['deliveryMethod'];
export type TransmittalFormat = TransmittalItem['format'];

export const DELIVERY_METHODS: DeliveryMethod[] = [
  'EMAIL_ATTACHMENT',
  'EMAIL_LINK',
  'HARD_COPY',
  'OTHER',
];
export const FORMATS: TransmittalFormat[] = ['PDF', 'NATIVE', 'PDF_AND_NATIVE', 'HARD_COPY'];
export const TRANSMITTAL_STATUSES = ['DRAFT', 'SENT', 'ACKNOWLEDGED', 'CANCELLED'] as const;

export function useTransmittal(id: string) {
  return useQuery({
    queryKey: ['transmittal', id],
    queryFn: async () =>
      unwrap(await api.GET('/api/v1/transmittals/{id}', { params: { path: { id } } })),
  });
}

export function useRefreshTransmittal() {
  const qc = useQueryClient();
  return (id: string, t?: Transmittal) => {
    if (t) qc.setQueryData(['transmittal', id], t);
    void qc.invalidateQueries({ queryKey: ['transmittal', id] });
    void qc.invalidateQueries({ queryKey: ['transmittals'] });
    void qc.invalidateQueries({ queryKey: ['documents'] });
  };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
