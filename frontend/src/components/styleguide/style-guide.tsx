'use client';

import { useState, type ReactNode } from 'react';
import { Container } from '@/components/layout/container';
import {
  Alert,
  Badge,
  BookingStatusBadge,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Checkbox,
  DetailList,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  FieldRow,
  ImageUploader,
  Input,
  LoadingState,
  PageHeader,
  Pagination,
  PasswordInput,
  PlaneIcon,
  PlusIcon,
  Select,
  Skeleton,
  Spinner,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Tabs,
  Textarea,
  Ticket,
  TrashIcon,
  useConfirm,
  useToast,
} from '@/components/ui';
import type { UploadedImage } from '@/lib/api/types';
import { formatDuration, formatMoney, formatTime } from '@/lib/format';

const swatches = [
  { name: 'ink', hex: '#13233a', use: 'Text, header bar' },
  { name: 'ink-soft', hex: '#4a5a6b', use: 'Secondary text' },
  { name: 'canvas', hex: '#f2f5f4', use: 'Page background' },
  { name: 'surface', hex: '#ffffff', use: 'Cards, inputs' },
  { name: 'line', hex: '#d8e0de', use: 'Borders, dividers' },
  { name: 'brand', hex: '#0b7a75', use: 'Primary actions, links' },
  { name: 'brand-soft', hex: '#dff1ef', use: 'Selected, highlighted' },
  { name: 'signal', hex: '#f2a900', use: 'Needs attention: holds, pending' },
  { name: 'danger', hex: '#b42318', use: 'Errors, destructive actions' },
  { name: 'success', hex: '#1d7a3e', use: 'Confirmed, done' },
];

function Section({ id, title, children, note }: { id: string; title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-line py-10">
      <h2 className="text-xl font-semibold">{title}</h2>
      {note && <p className="mt-1 max-w-2xl text-sm text-ink-soft">{note}</p>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

export function StyleGuide() {
  const toast = useToast();
  const confirm = useConfirm();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [tab, setTab] = useState<'upcoming' | 'past' | 'cancelled'>('upcoming');
  const [page, setPage] = useState(3);
  const [images, setImages] = useState<UploadedImage[]>([]);

  return (
    <Container className="py-12">
      <PageHeader
        title="UI kit"
        description="Every shared component, in the variants we use. Import them from '@/components/ui'; if something is missing, add it to the kit rather than styling it inside a feature."
      />

      <Section
        id="colour"
        title="Colour"
        note="Use the token names in classes (bg-brand, text-ink-soft, border-line). No raw hex values in feature code."
      >
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {swatches.map((s) => (
            <li key={s.name}>
              <span className="block h-16 rounded-control border border-line" style={{ background: s.hex }} />
              <p className="mt-2 text-sm font-semibold">{s.name}</p>
              <p className="text-sm text-ink-soft">{s.use}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="type"
        title="Type"
        note="Barlow Condensed (font-display) only for page titles and big numbers. Everything else is Barlow. Numbers are tabular, so prices and times line up."
      >
        <div className="flex flex-col gap-4">
          <p className="font-display text-5xl font-bold">Page title, font-display 5xl</p>
          <p className="text-xl font-semibold">Section title, xl semibold</p>
          <p className="text-base font-semibold">Card title, base semibold</p>
          <p className="max-w-prose">
            Body text is the base size with relaxed line height. Keep lines under about 80 characters by using the
            narrow container or max-w-prose for reading.
          </p>
          <p className="text-sm text-ink-soft">Secondary text, sm ink-soft</p>
          <dl className="grid max-w-xl grid-cols-3 gap-4">
            <div>
              <dt className="text-sm text-ink-soft">formatMoney(124950, 'USD')</dt>
              <dd className="text-2xl font-semibold">{formatMoney(124950, 'USD')}</dd>
            </div>
            <div>
              <dt className="text-sm text-ink-soft">formatDuration(275)</dt>
              <dd className="text-2xl font-semibold">{formatDuration(275)}</dd>
            </div>
            <div>
              <dt className="text-sm text-ink-soft">formatTime(…, 'Africa/Cairo')</dt>
              <dd className="text-2xl font-semibold">{formatTime('2026-12-01T07:30:00Z', 'Africa/Cairo')}</dd>
            </div>
          </dl>
        </div>
      </Section>

      <Section
        id="buttons"
        title="Buttons"
        note="One primary button per area. Labels say what happens: “Book 2 rooms”, not “Submit”."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Delete</Button>
          <Button loading>Saving</Button>
          <Button disabled>Disabled</Button>
          <Button icon={<PlusIcon className="size-4" />}>Add flight</Button>
          <ButtonLink href="/ui" variant="secondary">
            Link as button
          </ButtonLink>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
        </div>
      </Section>

      <Section
        id="forms"
        title="Forms"
        note="Wrap every control in <Field>. Errors from the backend (useSubmit → fieldErrors) appear under the field."
      >
        <Card className="max-w-3xl">
          <CardBody className="flex flex-col gap-5">
            <FieldRow>
              <Field label="Full name" hint="As in the passport" required>
                <Input placeholder="Mona Ahmed" />
              </Field>
              <Field label="Email" error="Please enter a valid email address">
                <Input defaultValue="mona@" />
              </Field>
            </FieldRow>
            <FieldRow>
              <Field label="Password">
                <PasswordInput defaultValue="Travel2026" />
              </Field>
              <Field label="Cabin">
                <Select defaultValue="">
                  <option value="" disabled>
                    Choose a cabin
                  </option>
                  <option>Economy</option>
                  <option>Business</option>
                </Select>
              </Field>
            </FieldRow>
            <Field label="Review" hint="Up to 1000 characters">
              <Textarea placeholder="How was the stay?" />
            </Field>
            <Checkbox label="I accept the cancellation and baggage policies" description="Required before payment." />
          </CardBody>
          <CardFooter>
            <Button variant="secondary">Cancel</Button>
            <Button>Save changes</Button>
          </CardFooter>
        </Card>
      </Section>

      <Section
        id="feedback"
        title="Alerts, badges and toasts"
        note="Alerts stay on the page; toasts confirm an action and disappear. Amber (signal) is only for things that need attention."
      >
        <div className="flex max-w-3xl flex-col gap-3">
          <Alert tone="signal" title="Your seats are held for 9:41">
            Pay before the timer ends or the seats go back on sale.
          </Alert>
          <Alert tone="danger" title="Payment failed">
            The card was declined. Try another card; your hold is still active.
          </Alert>
          <Alert tone="success">Booking confirmed. Reference WMK-48213.</Alert>
          <Alert tone="info">Prices are in the platform currency.</Alert>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <BookingStatusBadge status="pending_payment" />
          <BookingStatusBadge status="confirmed" />
          <BookingStatusBadge status="completed" />
          <BookingStatusBadge status="expired" />
          <BookingStatusBadge status="cancelled" />
          <Badge tone="brand">Public</Badge>
          <Badge>Draft</Badge>
          <Badge tone="info">Refund pending</Badge>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => toast.success('Post published')}>
            Success toast
          </Button>
          <Button variant="secondary" onClick={() => toast.error('The hold has expired. Search again to book.')}>
            Error toast
          </Button>
          <Button variant="secondary" onClick={() => toast.info('Rates updated today')}>
            Info toast
          </Button>
        </div>
      </Section>

      <Section
        id="cards"
        title="Cards, details and the ticket"
        note="The ticket is our signature element: use it for bookings, reservations and confirmations."
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader
              title="Passenger"
              description="Adult, 34"
              actions={
                <Button size="sm" variant="ghost">
                  Edit
                </Button>
              }
            />
            <CardBody>
              <DetailList
                items={[
                  { label: 'Passport', value: 'A1234567' },
                  { label: 'Nationality', value: 'Egypt' },
                  { label: 'Extra bags', value: '1 × 23 kg' },
                  { label: 'Seat', value: 'Economy' },
                ]}
              />
            </CardBody>
          </Card>
          <Ticket
            stub={
              <div className="flex h-full flex-col items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-ink-soft">Reference</p>
                  <p className="font-display text-2xl font-bold tracking-wide">WMK-48213</p>
                </div>
                <BookingStatusBadge status="confirmed" />
                <p className="text-lg font-semibold">{formatMoney(31200, 'USD')}</p>
              </div>
            }
          >
            <div className="flex items-center gap-2 text-sm text-ink-soft">
              <PlaneIcon className="size-4" /> Nile Air NP101, Economy
            </div>
            <div className="mt-4 flex items-end justify-between gap-4">
              <div>
                <p className="font-display text-4xl font-bold">CAI</p>
                <p className="text-sm text-ink-soft">09:30 Cairo</p>
              </div>
              <p className="pb-2 text-sm text-ink-soft">{formatDuration(330)}</p>
              <div className="text-right">
                <p className="font-display text-4xl font-bold">LHR</p>
                <p className="text-sm text-ink-soft">13:00 London</p>
              </div>
            </div>
            <p className="mt-4 text-sm text-ink-soft">Tuesday 1 December 2026, 2 passengers</p>
          </Ticket>
        </div>
      </Section>

      <Section
        id="lists"
        title="Tabs, tables and pagination"
        note="Every list is paginated at 10 rows (GEN-05) and has an empty state."
      >
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'upcoming', label: 'Upcoming', count: 2 },
            { value: 'past', label: 'Past', count: 5 },
            { value: 'cancelled', label: 'Cancelled', count: 0 },
          ]}
        />
        <Table>
          <THead>
            <tr>
              <TH>Reference</TH>
              <TH>Route</TH>
              <TH>Date</TH>
              <TH className="text-right">Total</TH>
              <TH>Status</TH>
              <TH>
                <span className="sr-only">Actions</span>
              </TH>
            </tr>
          </THead>
          <TBody>
            <TR>
              <TD className="font-semibold">WMK-48213</TD>
              <TD>CAI → LHR</TD>
              <TD>1 Dec 2026</TD>
              <TD className="text-right">{formatMoney(31200, 'USD')}</TD>
              <TD>
                <BookingStatusBadge status="confirmed" />
              </TD>
              <TD className="text-right">
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<TrashIcon className="size-4" />}
                  onClick={async () => {
                    const ok = await confirm({
                      title: 'Cancel this booking?',
                      description: 'You will get a refund of $187.20 (60%) under the airline’s policy.',
                      confirmLabel: 'Cancel booking',
                      cancelLabel: 'Keep booking',
                    });
                    if (ok) toast.success('Booking cancelled');
                  }}
                >
                  Cancel
                </Button>
              </TD>
            </TR>
            <TR>
              <TD className="font-semibold">WMK-47790</TD>
              <TD>Nile View Hotel, 2 rooms</TD>
              <TD>4–7 Dec 2026</TD>
              <TD className="text-right">{formatMoney(96000, 'USD')}</TD>
              <TD>
                <BookingStatusBadge status="pending_payment" />
              </TD>
              <TD />
            </TR>
          </TBody>
        </Table>
        <Pagination page={page} totalPages={12} onPageChange={setPage} />
      </Section>

      <Section
        id="states"
        title="Loading, empty and error states"
        note="Never leave an area blank. An empty state says what to do next."
      >
        <div className="grid gap-6 lg:grid-cols-3">
          <Card>
            <LoadingState label="Loading flights…" />
          </Card>
          <EmptyState
            title="No flights on this date"
            description="Try another day or a nearby airport."
            action={<Button variant="secondary">Change search</Button>}
          />
          <ErrorState message="The server did not answer." action={<Button>Try again</Button>} />
        </div>
        <div className="mt-6 flex items-center gap-6">
          <Spinner />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
      </Section>

      <Section
        id="overlays"
        title="Dialogs and confirmation"
        note="Destructive actions always ask first with useConfirm() (GEN-03). The confirm button names the action."
      >
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => setDialogOpen(true)}>
            Open a dialog
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              if (
                await confirm({
                  title: 'Delete this post?',
                  description: 'Its comments and likes are deleted too.',
                  confirmLabel: 'Delete post',
                })
              )
                toast.success('Post deleted');
            }}
          >
            Delete post
          </Button>
        </div>
        <Dialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          title="Edit room 101"
          description="Changes apply to new bookings only."
          footer={
            <>
              <Button variant="secondary" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => setDialogOpen(false)}>Save room</Button>
            </>
          }
        >
          <FieldRow>
            <Field label="Beds">
              <Input type="number" defaultValue={2} />
            </Field>
            <Field label="Price per night">
              <Input defaultValue="120.00" />
            </Field>
          </FieldRow>
        </Dialog>
      </Section>

      <Section
        id="uploads"
        title="Image uploads"
        note="GEN-08: JPG or PNG, 5 MB each, up to 5 per post, activity or hotel (1 airline logo)."
      >
        <div className="max-w-2xl">
          <ImageUploader
            existing={images}
            max={5}
            onAdd={async (files) => {
              await new Promise((r) => setTimeout(r, 600));
              setImages((all) => [
                ...all,
                ...files.map((f, i) => ({
                  id: `${Date.now()}-${i}`,
                  url: URL.createObjectURL(f),
                  mimeType: f.type,
                  size: f.size,
                })),
              ]);
            }}
            onRemove={(image) => setImages((all) => all.filter((i) => i.id !== image.id))}
          />
        </div>
      </Section>
    </Container>
  );
}
