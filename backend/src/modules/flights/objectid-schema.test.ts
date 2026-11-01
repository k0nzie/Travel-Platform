import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { model, Types } from 'mongoose';

const id = '507f1f77bcf86cd799439011';
const load = (p: string) => require(p);
const paths: [string, string, string[]][] = [
  ['../audit/schemas/audit-log.schema', 'AuditLogSchema', ['actorId', 'targetId']],
  ['../media/schemas/media.schema', 'MediaSchema', ['ownerId', 'uploadedBy']],
  ['../notifications/schemas/notification.schema', 'NotificationSchema', ['userId']],
  ['../users/schemas/session.schema', 'SessionSchema', ['userId']],
  ['../users/schemas/user.schema', 'UserSchema', ['moderatorAssignment.providerId']],
  ['./schemas/flight.schema', 'FlightSchema', ['airlineId']],
  ['./schemas/flight-booking-view.schema', 'FlightBookingViewSchema', ['flightId', 'userId']],
  ['../reference-data/schemas/reference.schemas', 'CitySchema', ['countryId']],
  ['../reference-data/schemas/reference.schemas', 'AirportSchema', ['cityId']],
];

test('cross-module schema ObjectId paths are real ObjectId, not Mixed/String', () => {
  for (const [file, name, fields] of paths) {
    const schema = load(file)[name];
    assert.ok(schema, `${name} exported`);
    for (const f of fields) assert.equal(schema.path(f)?.instance, 'ObjectId', `${name}.${f}`);
  }
});

test('flight documents cast string airlineId to ObjectId and queries cast $in', () => {
  const { FlightSchema } = load('./schemas/flight.schema');
  const Flight = model('ObjIdFlight', FlightSchema);
  const doc: any = new Flight({ airlineId: id });
  assert.ok(doc.airlineId instanceof Types.ObjectId);
  const q: any = Flight.find({ airlineId: { $in: [id] } }).cast();
  assert.ok(q.airlineId.$in[0] instanceof Types.ObjectId);
});

test('notification userId is cast to ObjectId on created docs (schedule notifications)', () => {
  const { NotificationSchema } = load('../notifications/schemas/notification.schema');
  const N = model('ObjIdNotification', NotificationSchema);
  assert.ok((new N({ userId: id }) as any).userId instanceof Types.ObjectId);
  const { NotificationsService } = load('../notifications/notifications.service');
  let docs: any[] = [];
  const svc = new NotificationsService({ insertMany: async (d: any[]) => (docs = d) } as any);
  return svc.notifyMany([id, new Types.ObjectId(id)], { type: 'flight_schedule_changed', title: 't', message: 'm' }).then((n: number) => {
    assert.equal(n, 1);
    assert.ok(docs[0].userId instanceof Types.ObjectId);
  });
});
