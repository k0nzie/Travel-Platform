import { Body, Controller, Get, Header, HttpCode, Param, Post, Query, Res, StreamableFile } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Role } from '../../common/constants/enums';
import { CurrentUser, Roles } from '../../common/decorators';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import {
  CancelFlightBookingDto,
  CreateFlightBookingDto,
  FlightBookingQueryDto,
} from './dto/flight-booking.dto';
import { FlightBookingsService } from './flight-bookings.service';

@ApiTags('Flight bookings')
@ApiCookieAuth('access_token')
@Controller('flight-bookings')
export class FlightBookingsController {
  constructor(private readonly bookings: FlightBookingsService) {}

  @Post('quote')
  @Roles(Role.User)
  @HttpCode(200)
  @ApiOperation({ summary: 'FLT-12, FLT-19, FLT-21: validate passengers + baggage and return the price summary' })
  quote(@Body() dto: CreateFlightBookingDto) {
    return this.bookings.quote(dto);
  }

  @Post()
  @Roles(Role.User)
  @ApiOperation({ summary: 'FLT-22: hold the seats for 10 minutes (booking starts as pending_payment)' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateFlightBookingDto) {
    return this.bookings.createHold(user, dto);
  }

  @Get()
  @Roles(Role.User)
  @ApiOperation({ summary: 'FLT-26: my flight bookings, filter by status or upcoming / past' })
  list(@CurrentUser() user: AuthUser, @Query() query: FlightBookingQueryDto) {
    return this.bookings.list(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'FLT-23: booking details with reference (owner or admin)' })
  getOne(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
    return this.bookings.getOne(user, id);
  }

  @Get(':id/e-ticket')
  @ApiProduces('application/pdf')
  @Header('Content-Type', 'application/pdf')
  @ApiOperation({ summary: 'FLT-25: download the e-ticket PDF' })
  async eTicket(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { reference, pdf } = await this.bookings.eTicket(user, id);
    res.setHeader('Content-Disposition', `attachment; filename="e-ticket-${reference}.pdf"`);
    return new StreamableFile(pdf);
  }

  @Get(':id/cancellation-preview')
  @Roles(Role.User)
  @ApiOperation({ summary: 'FLT-26: the refund I would get if I cancelled now' })
  cancellationPreview(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
    return this.bookings.cancellationPreview(user, id);
  }

  @Post(':id/cancel')
  @Roles(Role.User)
  @HttpCode(200)
  @ApiOperation({ summary: 'FLT-26, PAY-03: cancel a confirmed booking and refund under its tiers' })
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: CancelFlightBookingDto,
  ) {
    return this.bookings.cancel(user, id, dto.reason);
  }
}
