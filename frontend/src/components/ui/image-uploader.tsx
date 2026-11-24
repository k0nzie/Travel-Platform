'use client';

import { useEffect, useId, useState } from 'react';
import { cn } from '@/lib/cn';
import type { UploadedImage } from '@/lib/api/types';
import { ImageIcon, TrashIcon, UploadIcon } from './icons';

/**
 * GEN-08 image picker: JPG or PNG, up to 5 MB each, at most `max` images in total
 * (5 per post, activity or hotel; 1 for an airline logo). It checks the rules before upload
 * so people see the problem at once; the backend checks them again.
 *
 *   <ImageUploader existing={post.images} max={5} onAdd={upload} onRemove={removeImage} />
 *
 * onAdd receives the chosen files; upload them with api.upload(path, files).
 */

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png'];

export function ImageUploader({
  existing = [],
  max = 5,
  onAdd,
  onRemove,
  disabled = false,
  label = 'Photos',
}: {
  existing?: UploadedImage[];
  max?: number;
  onAdd: (files: File[]) => void | Promise<void>;
  onRemove?: (image: UploadedImage) => void | Promise<void>;
  disabled?: boolean;
  label?: string;
}) {
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [previews, setPreviews] = useState<string[]>([]);
  const remaining = Math.max(0, max - existing.length);

  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

  async function choose(list: FileList | null) {
    setError(null);
    const files = Array.from(list ?? []);
    if (!files.length) return;
    if (files.length > remaining) {
      setError(
        remaining === 0 ? `You already have ${max} images. Remove one first.` : `You can add ${remaining} more.`,
      );
      return;
    }
    const wrongType = files.find((f) => !TYPES.includes(f.type));
    if (wrongType) return setError(`${wrongType.name} is not a JPG or PNG image.`);
    const tooBig = files.find((f) => f.size > MAX_BYTES);
    if (tooBig) return setError(`${tooBig.name} is larger than 5 MB.`);

    setPreviews(files.map((f) => URL.createObjectURL(f)));
    setBusy(true);
    try {
      await onAdd(files);
    } finally {
      setBusy(false);
      setPreviews([]);
    }
  }

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold text-ink">{label}</p>
        <p className="text-sm text-ink-soft">
          {existing.length} of {max}. JPG or PNG, up to 5 MB each.
        </p>
      </div>

      <ul className="mt-2 grid grid-cols-3 gap-3 sm:grid-cols-5">
        {existing.map((image) => (
          <li
            key={image.id}
            className="group relative aspect-square overflow-hidden rounded-control border border-line bg-sunken"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- served by our backend */}
            <img src={image.url} alt="" className="size-full object-cover" />
            {onRemove && (
              <button
                type="button"
                disabled={disabled || busy}
                onClick={() => onRemove(image)}
                aria-label="Remove image"
                className="absolute top-1.5 right-1.5 rounded-control bg-surface/90 p-1.5 text-danger shadow-sm hover:bg-surface"
              >
                <TrashIcon className="size-4" />
              </button>
            )}
          </li>
        ))}
        {previews.map((url) => (
          <li
            key={url}
            className="relative aspect-square overflow-hidden rounded-control border border-line opacity-60"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
            <img src={url} alt="" className="size-full object-cover" />
          </li>
        ))}
        {remaining > 0 && (
          <li>
            <label
              htmlFor={id}
              className={cn(
                'flex aspect-square cursor-pointer flex-col items-center justify-center gap-1.5 rounded-control border-2 border-dashed border-line-strong text-sm text-ink-soft transition-colors hover:border-brand hover:text-brand',
                (disabled || busy) && 'pointer-events-none opacity-50',
              )}
            >
              {busy ? <ImageIcon className="size-6 animate-pulse" /> : <UploadIcon className="size-6" />}
              <span>{busy ? 'Uploading…' : 'Add'}</span>
            </label>
            <input
              id={id}
              type="file"
              accept="image/jpeg,image/png"
              multiple={remaining > 1}
              className="sr-only"
              disabled={disabled || busy}
              onChange={(e) => {
                void choose(e.target.files);
                e.target.value = '';
              }}
            />
          </li>
        )}
      </ul>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
