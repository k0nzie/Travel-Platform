'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, Field, FieldRow, Input, Select, useToast } from '@/components/ui';
import { api } from '@/lib/api/client';
import type { Currency, User } from '@/lib/api/types';
import { useAuth } from '@/lib/auth/auth-context';
import { useApiQuery } from '@/lib/hooks/use-api-query';
import { useSubmit } from '@/lib/hooks/use-submit';

/** ACC-09: name, phone and preferred currency. Saves only when every field is valid. */
export function ProfileForm() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const { data: currencies } = useApiQuery<Currency[]>('/reference/currencies');
  const [form, setForm] = useState({ name: '', phone: '', preferredCurrency: '' });

  useEffect(() => {
    if (user) setForm({ name: user.name, phone: user.phone ?? '', preferredCurrency: user.preferredCurrency });
  }, [user]);

  const { submit, pending, fieldErrors, formError } = useSubmit(async () => {
    const updated = await api.patch<User>('/users/me', {
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      preferredCurrency: form.preferredCurrency,
    });
    setUser(updated);
    toast.success('Profile saved');
  });

  if (!user) return null;

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
      <FieldRow>
        <Field label="Name" error={fieldErrors.name}>
          <Input
            autoComplete="name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </Field>
        <Field label="Email" hint="Your email cannot be changed.">
          <Input value={user.email} disabled readOnly />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Phone" hint="Optional. International format, e.g. +201001234567." error={fieldErrors.phone}>
          <Input
            type="tel"
            autoComplete="tel"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          />
        </Field>
        <Field
          label="Preferred currency"
          hint="Trip budgets are converted to this currency."
          error={fieldErrors.preferredCurrency}
        >
          <Select
            value={form.preferredCurrency}
            onChange={(e) => setForm((f) => ({ ...f, preferredCurrency: e.target.value }))}
          >
            {(currencies ?? [{ id: form.preferredCurrency, code: form.preferredCurrency, name: '' }]).map((c) => (
              <option key={c.code} value={c.code}>
                {c.code}
                {c.name ? ` – ${c.name}` : ''}
              </option>
            ))}
          </Select>
        </Field>
      </FieldRow>
      <div>
        <Button type="submit" loading={pending}>
          Save changes
        </Button>
      </div>
    </form>
  );
}
