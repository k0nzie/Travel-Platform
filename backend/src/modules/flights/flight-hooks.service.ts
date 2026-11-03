import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { BookingStatus } from '../../common/constants/enums';
import { PaginatedResult } from '../../common/dto/pagination.dto';
import { FlightBookingQueryDto } from './dto/flights.dto';
import { CabinType } from './schemas/flight.schema';

/** FLT-29 row contract: reference, passenger names, cabin, seats, status. */
export interface FlightBookingRow {
  id: string;
  reference: string;
  passengerNames: string[];
  cabin: CabinType;
  seats: number;
  status: BookingStatus;
  createdAt?: Date;
}

export interface FlightCancellationResult {
  cancelled: number;
  expired: number;
  /** Booking references whose refund handoff failed; repeating the flight cancel retries them. */
  failed: string[];
}

/**
 * Everything the flights module needs from flight bookings. The bookings module
 * (Person 3) owns the flight_bookings collection and implements this; flights
 * never reads or writes booking documents directly.
 */
export interface FlightBookingsBridge {
  /** FLT-05: airports are locked once a flight has any booking. */
  countForFlight(flightId: string): Promise<number>;
  /** FLT-29: moderator list for one flight. */
  listForFlight(flightId: string, query: FlightBookingQueryDto): Promise<PaginatedResult<FlightBookingRow>>;
  /** FLT-29: CSV export, all matches up to `max`. */
  exportForFlight(flightId: string, query: FlightBookingQueryDto, max: number): Promise<FlightBookingRow[]>;
  /** FLT-06: expire holds, cancel confirmed bookings with 100% refunds, notify. Must be idempotent. */
  onFlightCancelled(flightId: string): Promise<FlightCancellationResult>;
  /** FLT-05: refresh booking copies of the times and notify Confirmed passengers. */
  onScheduleChanged(flightId: string): Promise<{ updated: number }>;
}

/**
 * Registry that lets FlightBookingsModule plug into flights without an import cycle
 * (bookings already imports FlightsModule). Registered in FlightBookingsService.onModuleInit.
 */
@Injectable()
export class FlightHooksService {
  private readonly logger = new Logger(FlightHooksService.name);
  private registered?: FlightBookingsBridge;

  register(bridge: FlightBookingsBridge) {
    this.registered = bridge;
    this.logger.log('Flight bookings bridge registered');
  }

  get bookings(): FlightBookingsBridge {
    if (!this.registered) {
      throw new ServiceUnavailableException({
        message: 'Flight bookings are not available on this server',
        code: 'BOOKINGS_UNAVAILABLE',
      });
    }
    return this.registered;
  }
}
