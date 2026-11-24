# Frontend (Next.js)

The Milestone 2 frontend: Next.js 15 (App Router), React 19, TypeScript and Tailwind CSS 4.
Person 1 owns this foundation; everyone builds their pages on top of it.

## Run it

```bash
cd frontend
cp .env.example .env.local     # BACKEND_URL=http://localhost:4000
npm install
npm run dev                    # http://localhost:3000
```

The backend must be running (`cd backend && npm run start:dev`). Open **http://localhost:3000/ui**
to see every shared component.

Safari only: if login does not stick on `http://localhost`, set `COOKIE_SECURE=false` in the
backend's `.env` for local development (Chrome and Firefox accept secure cookies on localhost).

| Script | What it does |
|---|---|
| `npm run dev` | Development server on port 3000 |
| `npm run build` / `npm start` | Production build and server |
| `npm run lint` / `npm run typecheck` | ESLint and TypeScript checks (run both before a PR) |
| `npm run api:types` | Generates `src/lib/api/schema.d.ts` from the backend's Swagger (backend must be running) |

## How it talks to the backend

The browser only talks to Next.js. `next.config.ts` forwards `/api/*` and `/uploads/*` to the
backend, so the backend's **httpOnly cookies** work without any token handling in our code (ACC-19).
Never store tokens or user data in `localStorage`.

| Where your code runs | Use | Example |
|---|---|---|
| Client Component (`'use client'`) | `api` from `@/lib/api/client` | `await api.post('/posts', body)` |
| Client Component, loading data | `useApiQuery` from `@/lib/hooks/use-api-query` | `const { data, loading, error, reload } = useApiQuery<Page<Post>>('/posts/mine', { page })` |
| Server Component, signed-in data | `serverApi` from `@/lib/api/server` | `await serverApi<Page<Booking>>('/flight-bookings')` |
| Server Component, public cached data (ISR) | `serverApi(path, { auth: false, revalidate: 60 })` | published post, author page, public itinerary |

- Paths are the backend paths **without** `/api` (`/flights/search`, not `/api/flights/search`).
- An expired session is renewed automatically and the call retried once.
- Every failure is an `ApiError` with `status`, `code`, `message` and `fieldErrors`.
- Money is in **minor units** (cents): show it with `formatMoney(amountMinor, currency)`, send it
  with `toMinor('125.50')`.
- Flight times: `formatTime(flight.departureAt, flight.originTimezone)`, always in the airport's
  own time zone (GEN-06).

## Who is signed in

- **Client:** `const { user, status, logout, hasRole } = useAuth();` (`status` is `loading`,
  `authenticated` or `guest`).
- **Server:** `const user = await getCurrentUser();` (null when signed out).
- **Protect a section:** put `<RequireAuth roles={['admin']}>` in its `layout.tsx`. It renews an
  expired session, sends guests to login and back, sends moderators with a temporary password to
  `/change-password`, and shows "You do not have access" for the wrong role.
- **Restricted actions for guests (ACC-10):** `const requireLogin = useRequireLogin();` then
  `onClick={() => requireLogin() && book()}`. A guest goes to login and returns to the same page.

The backend still checks every request. Frontend checks are only there to help the user.

## The UI kit (`@/components/ui`)

```tsx
import { Button, Card, CardBody, CardHeader, Field, Input, PageHeader, useToast } from '@/components/ui';
```

| Need | Use |
|---|---|
| Page title | `<PageHeader title description actions back />`, the only `<h1>` on the page |
| Page width | `<Container>` (or `narrow` for forms and reading) with `<PageSection>` |
| Buttons | `<Button variant="primary/secondary/ghost/danger" loading>`, `<ButtonLink href>`, `<IconButton aria-label>` |
| Forms | `<Field label hint error><Input/></Field>`, `PasswordInput`, `Select`, `Textarea`, `Checkbox`, `FieldRow` |
| Submitting | `useSubmit` from `@/lib/hooks/use-submit` gives `pending`, `fieldErrors`, `formError` |
| Panels | `Card`, `CardHeader`, `CardBody`, `CardFooter`, `DetailList` |
| Bookings | `Ticket` (boarding-pass card) and `BookingStatusBadge` |
| Messages | `Alert` stays on the page; `useToast()` confirms an action briefly |
| Lists | `Table` + `THead/TBody/TR/TH/TD`, `Pagination` (page size 10), `Tabs` |
| Empty, loading, error | `EmptyState`, `LoadingState`, `ErrorState`, `Skeleton`, `Spinner` (never leave an area blank) |
| Delete / cancel | `const confirm = useConfirm(); if (await confirm({ title, confirmLabel: 'Delete post', tone: 'danger' }))` (GEN-03) |
| Other dialogs | `<Dialog open onClose title footer>` |
| Images | `<ImageUploader existing max onAdd onRemove />` with `api.upload(path, files)` (GEN-08) |
| Dashboards | `<DashboardShell title nav>` in the section's layout (see `app/admin/layout.tsx`) |
| Icons | `PlaneIcon`, `BedIcon`, `TrashIcon`… from the kit; add new ones to `icons.tsx` in the same style |

## Design rules

1. **Colours come from tokens only:** `bg-brand`, `text-ink-soft`, `border-line`, `bg-signal-soft`…
   (defined in `src/app/globals.css`). No hex values and no Tailwind default colours (`blue-500`).
2. **Teal (`brand`) is for actions and links. Amber (`signal`) is only for things that need
   attention:** holds and countdowns, pending payment. Red (`danger`) is for errors and destructive
   actions.
3. **Type:** `font-display` (Barlow Condensed) only for page titles and big numbers such as airport
   codes or a booking reference. Everything else uses the default Barlow.
4. **Words:** sentence case everywhere. Buttons say what happens ("Book 2 rooms", "Cancel booking",
   never "Submit" or "OK"), and the toast repeats it ("Booking cancelled"). Errors say what went
   wrong and how to fix it.
5. **Every screen works on a phone.** Check at 390px wide before opening a PR.
6. **Missing a component?** Add it to `src/components/ui/` and to the `/ui` page, rather than
   styling one-offs inside your feature.

## Where files go

```
src/app/<route>/page.tsx            pages (Server Components by default)
src/app/<section>/layout.tsx        section layout, e.g. RequireAuth + DashboardShell
src/components/ui/                  the shared kit (Person 1; others may add, with care)
src/components/<your-area>/         your own components: flights/, hotels/, checkout/, bookings/,
                                    itineraries/, blog/, admin/, airline/, hotel-admin/
src/lib/                            api client, auth, formatting, hooks
```

Starter pages already exist for every section (`PlannedPage`); replace them with your real pages.
Keep a component a Server Component unless it needs state, effects or event handlers. See the
rendering table in `docs/FRONTEND_WORK_SPLIT.md`.

## Before you open a PR

- `npm run lint` and `npm run typecheck` pass.
- Loading, empty and error states are handled; destructive actions ask first.
- It works at phone width and with the keyboard (Tab through it).
- Your prompts are added to `AI_PROMPTS.txt`.
