'use client';

import { createContext, useContext, useId, useState, type ComponentProps, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { AlertIcon, EyeIcon, EyeOffIcon } from './icons';

/**
 * Form building blocks. A <Field> gives its control an id, a label, a hint and an error,
 * and wires aria-invalid / aria-describedby for you:
 *
 *   <Field label="Email" error={fieldErrors.email}>
 *     <Input type="email" name="email" autoComplete="email" />
 *   </Field>
 *
 * Errors come straight from the backend (ApiError.fieldErrors) via useSubmit().
 */

interface FieldContextValue {
  id: string;
  describedBy?: string;
  invalid: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

function useFieldProps(id?: string, invalid?: boolean) {
  const field = useContext(FieldContext);
  return {
    id: id ?? field?.id,
    'aria-invalid': invalid || field?.invalid || undefined,
    'aria-describedby': field?.describedBy,
  };
}

export interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  /** Hide the label visually but keep it for screen readers. */
  hideLabel?: boolean;
  className?: string;
  children: ReactNode;
}

export function Field({ label, hint, error, required, hideLabel, className, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

  return (
    <FieldContext.Provider value={{ id, describedBy, invalid: !!error }}>
      <div className={cn('flex flex-col gap-1.5', className)}>
        <label htmlFor={id} className={cn('text-sm font-semibold text-ink', hideLabel && 'sr-only')}>
          {label}
          {required && (
            <span className="ml-0.5 text-danger" aria-hidden="true">
              *
            </span>
          )}
        </label>
        {children}
        {error ? (
          <p id={errorId} className="flex items-start gap-1.5 text-sm text-danger">
            <AlertIcon className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
        ) : (
          hint && (
            <p id={hintId} className="text-sm text-ink-soft">
              {hint}
            </p>
          )
        )}
      </div>
    </FieldContext.Provider>
  );
}

const control =
  'w-full rounded-control border border-line-strong bg-surface px-3 text-ink placeholder:text-ink-faint ' +
  'transition-colors hover:border-ink-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25 ' +
  'disabled:cursor-not-allowed disabled:bg-sunken disabled:text-ink-soft ' +
  'aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/20';

export interface InputProps extends ComponentProps<'input'> {
  invalid?: boolean;
}

export function Input({ className, id, invalid, ...props }: InputProps) {
  return <input className={cn(control, 'h-10 text-sm', className)} {...useFieldProps(id, invalid)} {...props} />;
}

/** Password input with a show / hide toggle. */
export function PasswordInput({ className, id, invalid, ...props }: InputProps) {
  const [visible, setVisible] = useState(false);
  const fieldProps = useFieldProps(id, invalid);
  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        className={cn(control, 'h-10 pr-11 text-sm', className)}
        {...fieldProps}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-control text-ink-soft hover:text-ink"
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
      >
        {visible ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
      </button>
    </div>
  );
}

export interface TextareaProps extends ComponentProps<'textarea'> {
  invalid?: boolean;
}

export function Textarea({ className, id, invalid, rows = 4, ...props }: TextareaProps) {
  return (
    <textarea
      rows={rows}
      className={cn(control, 'py-2 text-sm leading-relaxed', className)}
      {...useFieldProps(id, invalid)}
      {...props}
    />
  );
}

export interface SelectProps extends ComponentProps<'select'> {
  invalid?: boolean;
  placeholder?: string;
}

export function Select({ className, id, invalid, placeholder, children, ...props }: SelectProps) {
  return (
    <select
      className={cn(
        control,
        'h-10 appearance-none bg-[length:1rem] bg-[right_0.75rem_center] bg-no-repeat pr-9 text-sm',
        "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%234a5a6b' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]",
        className,
      )}
      {...useFieldProps(id, invalid)}
      {...props}
    >
      {placeholder !== undefined && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {children}
    </select>
  );
}

export interface CheckboxProps extends Omit<ComponentProps<'input'>, 'type'> {
  label: ReactNode;
  description?: ReactNode;
  invalid?: boolean;
}

/** A checkbox with its own label (consent, filters). Use it outside <Field>. */
export function Checkbox({ label, description, className, id, invalid, ...props }: CheckboxProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className={cn('flex items-start gap-3', className)}>
      <input
        id={inputId}
        type="checkbox"
        aria-invalid={invalid || undefined}
        className="mt-0.5 size-4.5 shrink-0 cursor-pointer rounded border-line-strong accent-brand"
        {...props}
      />
      <label htmlFor={inputId} className="cursor-pointer text-sm text-ink">
        {label}
        {description && <span className="mt-0.5 block text-ink-soft">{description}</span>}
      </label>
    </div>
  );
}

/** Groups several fields in a responsive grid: <FieldRow><Field/><Field/></FieldRow>. */
export function FieldRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid gap-4 sm:grid-cols-2', className)}>{children}</div>;
}
