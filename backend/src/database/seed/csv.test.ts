import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCsv } from './csv';

test('parses quoted fields, escaped quotes, embedded commas/newlines, CRLF and a BOM', () => {
  const text = '﻿id,name,timezone\r\n1,"Cairo, ""Old"" Town",Africa/Cairo\r\n2,"Multi\nline",Europe/Paris\r\n\r\n';
  assert.deepEqual(parseCsv(text), [
    { id: '1', name: 'Cairo, "Old" Town', timezone: 'Africa/Cairo' },
    { id: '2', name: 'Multi\nline', timezone: 'Europe/Paris' },
  ]);
});

test('missing trailing cells become empty strings and an empty file gives no rows', () => {
  assert.deepEqual(parseCsv('a,b,c\n1,2'), [{ a: '1', b: '2', c: '' }]);
  assert.deepEqual(parseCsv(''), []);
});
