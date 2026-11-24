'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button, Checkbox, Field, Input, PasswordInput } from '@/components/ui';
import { api } from '@/lib/api/client';
import type { User } from '@/lib/api/types';
import { useAuth } from '@/lib/auth/auth-context';
import { safeReturnTo } from '@/lib/auth/roles';
import { useSubmit } from '@/lib/hooks/use-submit';

/** ACC-01's password rule, checked here for quick feedback; the backend checks it again. */
export const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{8,128}$/;
export const PASSWORD_HINT = 'At least 8 characters, with a letter and a number.';

export function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { setUser } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '', acceptTerms: false });
  const set = (key: keyof typeof form) => (value: string | boolean) => setForm((f) => ({ ...f, [key]: value }));

  const { submit, pending, fieldErrors, formError, setFieldErrors } = useSubmit(async () => {
    const local: Record<string, string> = {};
    if (form.name.trim().length < 2) local.name = 'Enter your name.';
    if (!/^\S+@\S+\.\S+$/.test(form.email)) local.email = 'Enter a valid email address.';
    if (!PASSWORD_RULE.test(form.password)) local.password = PASSWORD_HINT;
    if (!form.acceptTerms) local.acceptTerms = 'You need to accept the terms and privacy policy.';
    if (Object.keys(local).length) {
      setFieldErrors(local);
      return;
    }
    await api.post('/auth/register', form);
    // Registration does not sign in, so log in straight away with the same details.
    const res = await api.post<{ user: User }>('/auth/login', { email: form.email, password: form.password });
    setUser(res.user);
    router.replace(safeReturnTo(params.get('returnTo'), '/'));
    router.refresh();
  });

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-5"
    >
      {formError && <Alert tone="danger">{formError}</Alert>}
      <Field label="Name" error={fieldErrors.name}>
        <Input name="name" autoComplete="name" value={form.name} onChange={(e) => set('name')(e.target.value)} />
      </Field>
      <Field label="Email" error={fieldErrors.email}>
        <Input
          type="email"
          name="email"
          autoComplete="email"
          value={form.email}
          onChange={(e) => set('email')(e.target.value)}
        />
      </Field>
      <Field label="Password" hint={PASSWORD_HINT} error={fieldErrors.password}>
        <PasswordInput
          name="password"
          autoComplete="new-password"
          value={form.password}
          onChange={(e) => set('password')(e.target.value)}
        />
      </Field>
      <div>
        <Checkbox
          label="I accept the terms of use and the privacy policy"
          checked={form.acceptTerms}
          onChange={(e) => set('acceptTerms')(e.target.checked)}
          invalid={!!fieldErrors.acceptTerms}
        />
        {fieldErrors.acceptTerms && (
          <p role="alert" className="mt-1.5 text-sm text-danger">
            {fieldErrors.acceptTerms}
          </p>
        )}
      </div>
      <Button type="submit" size="lg" block loading={pending}>
        Create account
      </Button>
    </form>
  );
}
