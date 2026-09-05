import * as assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { dateToString, parseDate } from 'common/libs/dateUtils';

describe('parseDate', () => {
   test('a bare YYYY-MM-DD string is local midnight, not UTC midnight', () => {
      assert.equal(parseDate('2024-03-05').getTime(), new Date(2024, 2, 5).getTime());
      assert.equal(dateToString(parseDate('2024-03-05'), 'YYYY-MM-DD'), '2024-03-05');
   });

   test('the ISO basic form is accepted too', () => {
      assert.equal(parseDate('20240305').getTime(), new Date(2024, 2, 5).getTime());
   });

   test('a date and time without a zone is local', () => {
      const expected = new Date(2024, 2, 5, 10, 11, 12, 456).getTime();
      assert.equal(parseDate('2024-03-05 10:11:12.456').getTime(), expected);
      assert.equal(parseDate('2024-03-05T10:11:12.456').getTime(), expected);
      assert.equal(parseDate('2024-03-05 10:11:12.456789').getTime(), expected);
   });

   test('an explicit zone is honoured', () => {
      assert.equal(parseDate('2024-03-05T10:11:12Z').getTime(), Date.UTC(2024, 2, 5, 10, 11, 12));
      assert.equal(parseDate('2024-03-05T10:11:12+05:00').getTime(), Date.UTC(2024, 2, 5, 5, 11, 12));
   });

   test('Date, number and no argument pass through', () => {
      const date = new Date(2024, 2, 5, 10, 11, 12);
      assert.equal(parseDate(date).getTime(), date.getTime());
      assert.equal(parseDate(0).getTime(), 0);
      assert.ok(Math.abs(parseDate().getTime() - Date.now()) < 1000);
   });

   test('unparsable input is null', () => {
      for (const val of ['not-a-date', 'O\'clock', '', '10:11:12', NaN, null, true, new Date(NaN)])
         assert.equal(parseDate(val as never), null, `expected null for ${String(val)}`);
   });
});

describe('dateToString', () => {
   const date = new Date(2024, 2, 5, 10, 11, 12, 456);

   test('every pattern in use is expanded', () => {
      assert.equal(dateToString(date, 'YYYY-MM-DD'), '2024-03-05');
      assert.equal(dateToString(date, 'YYYY-MM-DD HH:mm:ss'), '2024-03-05 10:11:12');
      assert.equal(dateToString(date, 'YYYY-MM-DD_HH-mm-ss'), '2024-03-05_10-11-12');
      assert.equal(dateToString(date, 'HH:mm:ss'), '10:11:12');
      assert.equal(dateToString(date, 'HH:mm:ss - YYYY/MM/DD'), '10:11:12 - 2024/03/05');
   });

   test('single digit parts are zero padded', () => {
      assert.equal(dateToString(new Date(2024, 0, 2, 3, 4, 5), 'YYYY-MM-DD HH:mm:ss'), '2024-01-02 03:04:05');
   });

   test('a run of S truncates or right pads the millisecond', () => {
      assert.equal(dateToString(date, 'HH:mm:ss.S'), '10:11:12.4');
      assert.equal(dateToString(date, 'YYYY-MM-DD HH:mm:ss.SS'), '2024-03-05 10:11:12.45');
      assert.equal(dateToString(date, 'YYYY-MM-DD HH:mm:ss.SSS'), '2024-03-05 10:11:12.456');
      assert.equal(dateToString(date, 'YYYY-MM-DD HH:mm:ss.SSSSSS'), '2024-03-05 10:11:12.456000');
      assert.equal(dateToString(new Date(2024, 2, 5, 10, 11, 12, 4), 'HH:mm:ss.SSSSSS'), '10:11:12.004000');
   });

   test('Z is the local offset, the way the SQL dump header prints it', () => {
      const offset = -date.getTimezoneOffset();
      const sign = offset < 0 ? '-' : '+';
      const hours = String(Math.trunc(Math.abs(offset) / 60)).padStart(2, '0');
      const minutes = String(Math.abs(offset) % 60).padStart(2, '0');
      assert.equal(dateToString(date, 'YYYY-MM-DDTHH:mm:ssZ'), `2024-03-05T10:11:12${sign}${hours}:${minutes}`);
   });

   test('an unparsable date prints the way moment printed it', () => {
      assert.equal(dateToString(null, 'YYYY-MM-DD'), 'Invalid date');
      assert.equal(dateToString(new Date(NaN), 'YYYY-MM-DD'), 'Invalid date');
   });
});
