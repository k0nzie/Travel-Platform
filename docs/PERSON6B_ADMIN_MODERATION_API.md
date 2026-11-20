# Person 6B — Admin and content moderation

This change implements Person 6B on top of the existing Blog module and shared account, audit, notification, and media services.

All `/api/admin/*` endpoints require the `admin` role. `POST /api/reports` requires an authenticated account. Lists use the shared `{ items, page, limit, total, totalPages }` response shape.

## Content reports (GEN-09, GEN-10)

- `POST /api/reports` — report a `post` or `comment` with `{ "contentType": "post", "contentId": "<ObjectId>", "reason": "..." }`. Set `contentType` to `comment` to report a comment.
- `GET /api/admin/reports?page=1&limit=10&status=pending` — review reports with reporter details and content preview. `status` may be `pending`, `dismissed`, or `resolved`; omit it to list all statuses.
- `PATCH /api/admin/reports/:id` — resolve a pending report with `{ "action": "dismiss", "note": "..." }`. Supported actions are `dismiss`, `hide`, and `delete`.

Hiding a post or comment excludes it from public blog reads. Deleting a post also removes its blog-owned comments, likes, and uploaded images. Every resolution is recorded in the audit log. A report whose content was removed before review can still be dismissed.

## Moderator and account administration (ACC-13–ACC-16)

- `POST /api/admin/moderators` — create an airline or hotel moderator. Body: `{ "name": "...", "email": "...", "temporaryPassword": "...", "providerType": "airline", "providerId": "<ObjectId>" }`. Set `providerType` to `hotel` for a hotel moderator. The temporary password must meet the platform password rule, and the moderator must change it at next login.
- `GET /api/admin/accounts?page=1&limit=10&role=user&status=active&q=name-or-email` — paginated account list; each filter is optional.
- `PATCH /api/admin/accounts/:id/suspend` — suspend a user or moderator; optional body `{ "reason": "..." }`. Existing sessions are revoked.
- `PATCH /api/admin/accounts/:id/reactivate` — reactivate a suspended user or moderator; optional body `{ "reason": "..." }`.

Account status changes are audited and notify the affected account. Admin accounts cannot be suspended through these endpoints. Self-deactivated accounts cannot be reactivated here.

## Admin bookings (ACC-17)

- `GET /api/admin/bookings?page=1&limit=10&type=flight` returns flight bookings.
- Use `type=hotel` to return hotel bookings. Omit `type` to return both types, newest first.

The response contains booking summaries and traveler name/email, and omits flight passenger passport details.

## Setup

No data migration or environment setting is required. Mongoose schema defaults add `hidden: false` to newly created posts and comments. Existing documents without the field remain visible because public queries exclude only `hidden: true`. Start the backend using the existing project setup and see `/api/docs` for the generated Swagger definitions.
