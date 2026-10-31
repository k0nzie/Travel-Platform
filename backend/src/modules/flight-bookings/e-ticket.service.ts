import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { DateTime } from 'luxon';
import { FlightBooking } from './schemas/flight-booking.schema';

const localTime = (date: Date, zone: string) =>
  DateTime.fromJSDate(date, { zone: 'utc' }).setZone(zone).toFormat('ccc dd LLL yyyy, HH:mm');

/** FLT-25: one-file PDF e-ticket, built on demand from the booking. */
@Injectable()
export class ETicketService {
  render(booking: FlightBooking): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `E-ticket ${booking.reference}` } });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(22).text('E-Ticket');
      doc.moveDown(0.5);
      doc.fontSize(12).text(`Booking reference: ${booking.reference}`);
      doc.text(`Status: ${booking.status}`);
      doc.moveDown();

      doc.fontSize(15).text('Flights');
      for (const leg of booking.legs) {
        doc.moveDown(0.5);
        doc.fontSize(12).text(`${leg.airlineName} ${leg.flightNumber} (${leg.cabinClass})`);
        doc
          .fontSize(10)
          .text(`Depart ${leg.origin.iataCode}, ${leg.origin.name}: ${localTime(leg.departureAt, leg.origin.timezone)}`)
          .text(
            `Arrive ${leg.destination.iataCode}, ${leg.destination.name}: ` +
              localTime(leg.arrivalAt, leg.destination.timezone),
          )
          .text(
            `Baggage: ${leg.baggagePolicy.cabinBagsIncluded} cabin, ` +
              `${leg.baggagePolicy.checkedBagsIncluded} checked included per passenger`,
          );
      }
      doc.moveDown();

      doc.fontSize(15).text('Passengers');
      for (const p of booking.passengers) {
        doc.moveDown(0.3);
        const bags = p.extraBags ? `, ${p.extraBags} extra bag(s)` : '';
        doc.fontSize(11).text(`${p.firstName} ${p.lastName} (${p.type})${bags}`);
        doc.fontSize(10).text(`Ticket: ${p.ticketNumber}   Passport: ${p.passportNumber}`);
      }
      doc.moveDown();

      doc.fontSize(12).text(`Total paid: ${(booking.totalMinor / 100).toFixed(2)} ${booking.currency}`);
      doc.moveDown();
      doc.fontSize(9).text('All times are local to the airport. Please arrive at least 3 hours before departure.');
      doc.end();
    });
  }
}
