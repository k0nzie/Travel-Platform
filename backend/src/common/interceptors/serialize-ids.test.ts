import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { model, Schema, Types } from 'mongoose';
import { serializeIds } from './serialize-ids.interceptor';

test('responses expose id, never _id or __v, and ObjectIds become strings', () => {
  const id = new Types.ObjectId();
  const other = new Types.ObjectId();
  const out: any = serializeIds({
    items: [{ _id: id, __v: 3, ownerId: other, nested: { _id: other, at: new Date(0) }, tags: ['a'] }],
    total: 1,
  });
  assert.deepEqual(out.items[0], {
    id: id.toHexString(),
    ownerId: other.toHexString(),
    nested: { id: other.toHexString(), at: new Date(0) },
    tags: ['a'],
  });
  assert.equal(out.total, 1);
});

test('hydrated documents use their schema toJSON first, so stripped secrets stay stripped', () => {
  const schema = new Schema({ name: String, secret: String });
  schema.set('toJSON', {
    transform: (_doc, ret: any) => {
      delete ret.secret;
      return ret;
    },
  });
  const Doc = model('SerializeIdsDoc', schema);
  const doc = new Doc({ name: 'x', secret: 'hash' });
  const out: any = serializeIds(doc);
  assert.equal(out.id, String(doc._id));
  assert.equal(out.secret, undefined);
  assert.equal(out._id, undefined);
});

test('an explicit id wins over _id, and primitives / buffers pass through', () => {
  assert.deepEqual(serializeIds({ id: 'keep', _id: new Types.ObjectId() }), { id: 'keep' });
  assert.equal(serializeIds('csv body'), 'csv body');
  const buf = Buffer.from('%PDF');
  assert.equal(serializeIds(buf), buf);
  assert.equal(serializeIds(null), null);
});
