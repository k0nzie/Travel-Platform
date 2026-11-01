import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Res, UploadedFile } from '@nestjs/common';
import { ApiBadRequestResponse, ApiConflictResponse, ApiCookieAuth, ApiCreatedResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiProduces, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { Response } from 'express';
import { Role } from '../../common/constants/enums';
import { CurrentUser, Public, Roles } from '../../common/decorators';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { SingleImageUpload } from '../media/media.decorators';
import { BaggagePolicyDto, CabinDto, CancellationPolicyDto, CreateAirlineDto, CreateFlightDto, FlightBookingQueryDto, FlightSearchDto, UpdateAirlineDto, UpdateCabinDto, UpdateFlightDto } from './dto/flights.dto';
import { FlightsService } from './flights.service';
import { airlineResponse, bookingResponse, cancelResponse, detailsResponse, flightResponse, mediaResponse, offerResponse, pageResponse } from './flights.swagger';

/** HTTP adaptation only. Every protected operation also authorizes in FlightsService. */
@ApiTags('Airlines')
@ApiCookieAuth('access_token')
@ApiBadRequestResponse({ description: 'Invalid ID, DTO, country or image; shared field-error format' })
@ApiUnauthorizedResponse({ description: 'Missing or expired session' })
@ApiForbiddenResponse({ description: 'Wrong role or provider assignment' })
@ApiNotFoundResponse({ description: 'Airline not found' })
@ApiConflictResponse({ description: 'Duplicate airline code' })
@Controller('airlines')
export class AirlinesController {
  constructor(private readonly flights: FlightsService) {}

  @Public() @Get()
  @ApiOperation({ summary: 'List airline profiles', description: 'Public; alphabetic order with ID tie-breaker; default page size 10.' })
  @ApiOkResponse({ schema: pageResponse(airlineResponse) })
  list(@Query() q: PaginationQueryDto) { return this.flights.listAirlines(q); }

  @Public() @Get(':id')
  @ApiOperation({ summary: 'Read airline profile and logo' })
  @ApiOkResponse({ schema: { ...airlineResponse, properties: { ...airlineResponse.properties, logo: { ...mediaResponse, nullable: true } } } })
  details(@Param('id', ParseObjectIdPipe) id: string) { return this.flights.airlineDetails(id); }

  @Roles(Role.Admin) @Post()
  @ApiOperation({ summary: 'FLT-01: admin creates an airline', description: 'Validates reference country and records provider.created audit entry.' })
  @ApiCreatedResponse({ schema: airlineResponse })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAirlineDto) { return this.flights.createAirline(user, dto); }

  @Roles(Role.AirlineModerator) @Patch(':id')
  @ApiOperation({ summary: 'FLT-01: edit assigned airline profile' })
  @ApiOkResponse({ schema: airlineResponse })
  update(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateAirlineDto) { return this.flights.updateAirline(user, id, dto); }

  @Roles(Role.AirlineModerator) @Put(':id/baggage-policy')
  @ApiOperation({ summary: 'FLT-04/08: set airline baggage policy', description: 'Extra bag price > 0, max extra bags >= 0, per cabin free bags (whole >= 0) and max kg per bag > 0. Applies to all flights of the airline.' })
  @ApiOkResponse({ schema: airlineResponse })
  baggagePolicy(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string, @Body() dto: BaggagePolicyDto) { return this.flights.setBaggagePolicy(user, id, dto); }

  @Roles(Role.AirlineModerator) @Put(':id/cancellation-policy')
  @ApiOperation({ summary: 'FLT-09: set airline cancellation tiers', description: 'Unique whole-day thresholds >= 0 with refund 0..100. Refund uses the highest threshold <= days remaining, else 0%.' })
  @ApiOkResponse({ schema: airlineResponse })
  cancellationPolicy(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string, @Body() dto: CancellationPolicyDto) { return this.flights.setCancellationPolicy(user, id, dto); }

  @Roles(Role.AirlineModerator) @Post(':id/logo') @SingleImageUpload()
  @ApiOperation({ summary: 'FLT-01: upload assigned airline logo', description: 'Multipart image, JPG/PNG up to 5 MB. One logo maximum; DELETE the old logo before uploading a replacement.' })
  @ApiCreatedResponse({ schema: { type: 'array', items: mediaResponse } })
  logo(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string, @UploadedFile() file: Express.Multer.File) { return this.flights.uploadLogo(user, id, file); }

  @Roles(Role.AirlineModerator) @Delete(':id/logo')
  @ApiOperation({ summary: 'Remove assigned airline logo before replacement' })
  @ApiOkResponse({ schema: { type: 'object', properties: { deleted: { type: 'integer' } } } })
  removeLogo(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) { return this.flights.removeLogo(user, id); }
}

@ApiTags('Flights')
@ApiCookieAuth('access_token')
@ApiBadRequestResponse({ description: 'Invalid ID, DTO, airport, local date/time, passengers or policy; shared field-error format' })
@ApiUnauthorizedResponse({ description: 'Missing or expired session' })
@ApiForbiddenResponse({ description: 'Not the assigned airline moderator' })
@ApiNotFoundResponse({ description: 'Flight or airline not found' })
@ApiConflictResponse({ description: 'Flight no longer editable, duplicate flight, occupied capacity or concurrent change; reload and retry' })
@Controller('flights')
export class FlightsController {
  constructor(private readonly flights: FlightsService) {}

  @Public() @Get('search')
  @ApiOperation({ summary: 'FLT-11/15: search one-way or round-trip flights', description: 'Direct flights on origin-local days. Return date yields chronological pairs. Adults/children consume seats; lap infants do not (at most one/adult, pay 10% fare). Price is cheapest eligible fare per seated passenger for the itinerary; totalPrice includes seated passengers and infants, excluding optional baggage. Duration is total flying minutes. Ascending sort, departure then IDs break ties. Pages default to 10.' })
  @ApiOkResponse({ schema: pageResponse(offerResponse) })
  search(@Query() q: FlightSearchDto) { return this.flights.search(q); }

  @Public() @Get(':id')
  @ApiOperation({ summary: 'FLT-17: flight details, policies, local times and available seats', description: 'Availability is capacity minus held and booked; zero for non-bookable flights. Availability is advisory until an atomic hold succeeds.' })
  @ApiOkResponse({ schema: detailsResponse })
  details(@Param('id', ParseObjectIdPipe) id: string) { return this.flights.details(id); }

  @Roles(Role.AirlineModerator) @Post()
  @ApiOperation({ summary: 'FLT-03/04/08/09: create a scheduled flight', description: 'Only assigned airline. Airport-local times have no offset; ambiguous/nonexistent DST times rejected. Stores UTC. Inventory starts at zero held/booked. Platform currency only.' })
  @ApiCreatedResponse({ schema: flightResponse })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateFlightDto) { return this.flights.createFlight(user, dto); }

  @Roles(Role.AirlineModerator) @Patch(':id')
  @ApiOperation({ summary: 'FLT-05: edit a scheduled future flight', description: 'Only times, cabin price/capacity (matched by cabin class) and, while the flight has no bookings, airports. flightNumber, airlineId and currency are immutable. Capacity cannot drop below booked + held. Time changes notify Confirmed passengers.' })
  @ApiOkResponse({ schema: flightResponse })
  update(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateFlightDto) { return this.flights.updateFlight(user, id, dto); }

  @Roles(Role.AirlineModerator) @Post(':id/cabins')
  @ApiOperation({ summary: 'FLT-04: add a cabin class to a scheduled flight', description: 'Economy, Premium Economy, Business or First; each at most once; whole capacity > 0; price > 0.' })
  @ApiCreatedResponse({ schema: flightResponse })
  addCabin(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string, @Body() dto: CabinDto) { return this.flights.addCabin(user, id, dto); }

  @Roles(Role.AirlineModerator) @Patch(':id/cabins/:cabinId')
  @ApiOperation({ summary: 'FLT-04/05: change a cabin price or capacity', description: 'Capacity cannot drop below seats already booked or held. Existing bookings keep their price.' })
  @ApiOkResponse({ schema: flightResponse })
  updateCabin(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string, @Param('cabinId', ParseObjectIdPipe) cabinId: string, @Body() dto: UpdateCabinDto) { return this.flights.updateCabin(user, id, cabinId, dto); }

  @Roles(Role.AirlineModerator) @Post(':id/cancel')
  @ApiOperation({ summary: 'FLT-06: cancel a scheduled future flight', description: 'Terminal. Releases held seats, cancels Confirmed bookings with a 100% refund marker, expires PendingPayment bookings, notifies passengers and calls the booking module handoff. Departed/completed/cancelled flights return 409.' })
  @ApiCreatedResponse({ schema: cancelResponse })
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) { return this.flights.cancelFlight(user, id); }

  @Roles(Role.AirlineModerator) @Get(':id/bookings')
  @ApiOperation({ summary: 'FLT-29: list bookings for an assigned-airline flight', description: 'Read-only flight_bookings projection; newest first, ID tie-breaker. Creation dates are inclusive UTC days.' })
  @ApiOkResponse({ schema: pageResponse(bookingResponse) })
  bookings(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string, @Query() q: FlightBookingQueryDto) { return this.flights.listBookings(user, id, q); }

  @Roles(Role.AirlineModerator) @Get([':id/bookings.csv', ':id/passengers/export']) @ApiProduces('text/csv')
  @ApiOperation({ summary: 'FLT-29: export matching bookings as CSV', description: 'Also served at /flights/:id/passengers/export. Same filters and scope as list; all matches regardless of page/limit. UTF-8, CRLF records, RFC4180 escaping. Formula-like strings prefixed with apostrophe for spreadsheets.' })
  @ApiOkResponse({ content: { 'text/csv': { schema: { type: 'string' } } } })
  async csv(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string, @Query() q: FlightBookingQueryDto, @Res({ passthrough: true }) res: Response) {
    const csv = await this.flights.bookingsCsv(user, id, q);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="flight-${id}-bookings.csv"`);
    return csv;
  }
}
