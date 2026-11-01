import { FlightBookingView } from './schemas/flight-booking-view.schema';

/** RFC4180: quote every field, double quotes, preserve embedded CR/LF and UTF-8.
 * Prefix spreadsheet formula-like strings with an apostrophe before RFC escaping.
 */
export function csvCell(value: unknown): string {
  let text = value == null ? '' : value instanceof Date ? value.toISOString() : String(value);
  if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

/**
 * FLT-29 deterministic column contract:
 * reference, passenger names, cabin, seats, status (Confirmed or Cancelled)
 */
export function bookingCsv(rows: FlightBookingView[]): string {
  const headers = ['reference', 'passenger names', 'cabin', 'seats', 'status'];
  const dataRows = rows.map((row) => [
    csvCell(row.reference),
    csvCell(Array.isArray(row.passengerNames) ? row.passengerNames.join(', ') : (row.passengerNames ?? '')),
    csvCell(row.cabin),
    csvCell(row.seats),
    csvCell(row.status),
  ].join(','));
  return [headers.map(csvCell).join(','), ...dataRows].join('\r\n') + '\r\n';
}
