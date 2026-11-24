'use client';

import { useCallback, useState } from 'react';
import { ApiError, errorMessage } from '@/lib/api/errors';

/**
 * Runs a form action and keeps its state, so every form handles errors the same way (GEN-02):
 *
 *   const { submit, pending, fieldErrors, formError } = useSubmit(async (values: Values) => {
 *     await api.post('/posts', values);
 *     toast.success('Post published');
 *   });
 *   <form onSubmit={(e) => { e.preventDefault(); submit(values); }}>
 *     <Field label="Title" error={fieldErrors.title}>…</Field>
 *     {formError && <Alert tone="danger">{formError}</Alert>}
 *
 * fieldErrors come from the backend's validation errors; formError is the general message.
 */
export function useSubmit<TArgs extends unknown[], TResult>(action: (...args: TArgs) => Promise<TResult>) {
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const submit = useCallback(
    async (...args: TArgs): Promise<TResult | undefined> => {
      setPending(true);
      setFieldErrors({});
      setFormError(null);
      try {
        return await action(...args);
      } catch (error) {
        if (error instanceof ApiError && Object.keys(error.fieldErrors).length) {
          setFieldErrors(error.fieldErrors);
          setFormError('Please fix the highlighted fields.');
        } else {
          setFormError(errorMessage(error));
        }
        return undefined;
      } finally {
        setPending(false);
      }
    },
    [action],
  );

  const reset = useCallback(() => {
    setFieldErrors({});
    setFormError(null);
  }, []);

  return { submit, pending, fieldErrors, formError, setFieldErrors, setFormError, reset };
}
