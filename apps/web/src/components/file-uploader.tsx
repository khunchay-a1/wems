'use client';

import type { Dto } from '@wems/api-contract';
import { CheckCircle2, FileUp, Loader2, RotateCcw, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ApiError, api, unwrap } from '@/lib/api';
import { cn } from '@/lib/utils';

export type UploadedFile = Dto<'FileDto'>;
type Purpose = Dto<'CreateUploadRequestDto'>['purpose'];

interface Item {
  key: string;
  file: File;
  percent: number;
  state: 'uploading' | 'processing' | 'done' | 'error';
  error?: string;
  result?: UploadedFile;
}

/** PUT to the presigned URL with progress (XMLHttpRequest — fetch has no upload progress). */
function putWithProgress(
  url: string,
  file: File,
  headers: Record<string, string>,
  onProgress: (p: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) =>
      e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`upload ${xhr.status}`));
    xhr.onerror = () => reject(new Error('network'));
    xhr.send(file);
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Upload flow upload-url → PUT → complete (BR-PLT-020), optionally waiting until the worker
 * marks the file AVAILABLE. Shared component from docs/07-web-ui.md §3.
 */
export async function uploadFile(
  file: File,
  purpose: Purpose,
  onProgress: (p: number) => void = () => {},
  waitAvailable = true,
): Promise<UploadedFile> {
  const target = unwrap(
    await api.POST('/api/v1/files/upload-url', {
      body: {
        originalName: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        purpose,
      },
    }),
  );
  await putWithProgress(
    target.uploadUrl,
    file,
    target.headers as Record<string, string>,
    onProgress,
  );
  let f = unwrap(
    await api.POST('/api/v1/files/{id}/complete', { params: { path: { id: target.fileId } } }),
  );
  for (let i = 0; waitAvailable && f.status === 'PROCESSING' && i < 60; i++) {
    await sleep(Math.min(500 + i * 250, 3000));
    f = unwrap(await api.GET('/api/v1/files/{id}', { params: { path: { id: f.id } } }));
  }
  return f;
}

export function FileUploader({
  purpose,
  accept,
  multiple = false,
  disabled,
  onUploaded,
  label,
  testId = 'file-uploader',
}: {
  purpose: Purpose;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  onUploaded: (file: UploadedFile) => void;
  label?: string;
  testId?: string;
}) {
  const t = useTranslations('common');
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);

  const patch = (key: string, p: Partial<Item>) =>
    setItems((list) => list.map((i) => (i.key === key ? { ...i, ...p } : i)));

  const start = useCallback(
    async (file: File, key: string) => {
      try {
        const result = await uploadFile(file, purpose, (percent) =>
          patch(key, { percent, state: percent >= 100 ? 'processing' : 'uploading' }),
        );
        if (result.status === 'REJECTED') {
          patch(key, { state: 'error', error: result.rejectReason ?? undefined });
          return;
        }
        patch(key, { state: 'done', result, percent: 100 });
        onUploaded(result);
      } catch (e) {
        patch(key, { state: 'error', error: e instanceof ApiError ? e.problem.title : undefined });
      }
    },
    [purpose, onUploaded],
  );

  const add = (files: FileList | null) => {
    if (!files) return;
    const list = Array.from(files).slice(0, multiple ? undefined : 1);
    const fresh = list.map((file) => ({
      key: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
      file,
      percent: 0,
      state: 'uploading' as const,
    }));
    setItems((prev) => (multiple ? [...prev, ...fresh] : fresh));
    fresh.forEach((i) => void start(i.file, i.key));
  };

  return (
    <div className="space-y-2" data-testid={testId}>
      <div
        role="button"
        tabIndex={0}
        aria-disabled={disabled}
        className={cn(
          'flex cursor-pointer flex-col items-center gap-2 rounded-md border-2 border-dashed border-border p-6 text-center text-sm text-muted transition-colors hover:bg-subtle',
          dragging && 'border-primary bg-subtle',
          disabled && 'pointer-events-none opacity-50',
        )}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          add(e.dataTransfer.files);
        }}
      >
        <FileUp className="size-6" />
        <span>{label ?? t('upload')}</span>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={accept}
          multiple={multiple}
          onChange={(e) => {
            add(e.target.files);
            e.target.value = '';
          }}
          data-testid={`${testId}-input`}
        />
      </div>
      {items.length ? (
        <ul className="space-y-1 text-sm">
          {items.map((i) => (
            <li
              key={i.key}
              className="flex items-center gap-2 rounded border border-border px-3 py-2"
              data-testid="upload-item"
              data-state={i.state}
            >
              {i.state === 'done' ? (
                <CheckCircle2 className="size-4 text-success-fg" />
              ) : i.state === 'error' ? (
                <XCircle className="size-4 text-danger-fg" />
              ) : (
                <Loader2 className="size-4 animate-spin text-muted" />
              )}
              <span className="min-w-0 flex-1 truncate">{i.file.name}</span>
              <span className="text-xs text-muted">
                {i.state === 'uploading'
                  ? t('uploading', { percent: i.percent })
                  : i.state === 'processing'
                    ? t('processing')
                    : i.state === 'error'
                      ? (i.error ?? t('unexpected'))
                      : null}
              </span>
              {i.state === 'error' ? (
                <Button
                  size="sm"
                  variant="ghost"
                  type="button"
                  onClick={() => {
                    patch(i.key, { state: 'uploading', percent: 0, error: undefined });
                    void start(i.file, i.key);
                  }}
                  aria-label={t('retry')}
                >
                  <RotateCcw />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
