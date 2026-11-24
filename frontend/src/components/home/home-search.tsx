'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { BedIcon, Button, Field, Input, PlaneIcon, SearchIcon } from '@/components/ui';
import { cn } from '@/lib/cn';
import { todayIso } from '@/lib/format';

/**
 * The search on the home page. It only builds the URL: the search pages (Persons 2 and 4) read
 * these query parameters, which use the backend's names:
 *   /flights?origin=CAI&destination=LHR&departureDate=2026-12-01&adults=1
 *   /hotels?city=Cairo&checkIn=2026-12-01&checkOut=2026-12-04&guests=2&rooms=1
 */
export function HomeSearch() {
  const router = useRouter();
  const [mode, setMode] = useState<'flights' | 'hotels'>('flights');
  const today = todayIso();

  function go(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const params = new URLSearchParams();
    data.forEach((value, key) => {
      const v = String(value).trim();
      if (v) params.set(key, key === 'origin' || key === 'destination' ? v.toUpperCase() : v);
    });
    router.push(`/${mode}?${params.toString()}`);
  }

  return (
    <div className="rounded-card bg-surface p-2 text-ink shadow-float">
      <div role="tablist" aria-label="What to search" className="flex gap-1 p-1">
        {(
          [
            { value: 'flights', label: 'Flights', icon: <PlaneIcon className="size-4" /> },
            { value: 'hotels', label: 'Hotels', icon: <BedIcon className="size-4" /> },
          ] as const
        ).map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={mode === tab.value}
            onClick={() => setMode(tab.value)}
            className={cn(
              'inline-flex items-center gap-2 rounded-control px-4 py-2 text-sm font-semibold transition-colors',
              mode === tab.value ? 'bg-ink text-ink-inverse' : 'text-ink-soft hover:bg-sunken',
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <form
        key={mode}
        onSubmit={go}
        className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_8rem_auto] lg:items-start"
      >
        {mode === 'flights' ? (
          <>
            <Field label="From" hint="Airport code, e.g. CAI">
              <Input name="origin" required maxLength={3} placeholder="CAI" className="uppercase" />
            </Field>
            <Field label="To" hint="Airport code, e.g. LHR">
              <Input name="destination" required maxLength={3} placeholder="LHR" className="uppercase" />
            </Field>
            <Field label="Departure" hint="Local date at the airport">
              <Input type="date" name="departureDate" required min={today} defaultValue={today} />
            </Field>
            <Field label="Adults" hint="Children on the next page">
              <Input type="number" name="adults" min={1} max={9} defaultValue={1} />
            </Field>
          </>
        ) : (
          <>
            <Field label="City" hint="Where you are staying">
              <Input name="city" required placeholder="Cairo" />
            </Field>
            <Field label="Check-in">
              <Input type="date" name="checkIn" required min={today} defaultValue={today} />
            </Field>
            <Field label="Check-out">
              <Input type="date" name="checkOut" required min={today} />
            </Field>
            <Field label="Guests" hint="Rooms on the next page">
              <Input type="number" name="guests" min={1} max={30} defaultValue={2} />
            </Field>
          </>
        )}
        <Button
          type="submit"
          size="lg"
          icon={<SearchIcon className="size-5" />}
          className="sm:col-span-2 lg:col-span-1 lg:mt-[1.625rem]"
        >
          Search
        </Button>
      </form>
    </div>
  );
}
