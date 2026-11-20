import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '../../common/constants/enums';
import { CurrentUser, Roles } from '../../common/decorators';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { HotelStaffBookingsQueryDto } from './dto/hotel-staff-bookings.dto';
import { HotelStaffBookingsService } from './hotel-staff-bookings.service';

@ApiTags('Hotel bookings')
@ApiCookieAuth('access_token')
@Controller('hotel-bookings')
export class HotelStaffBookingsController {
  constructor(private readonly bookings: HotelStaffBookingsService) {}

  @Get('hotel/:hotelId')
  @Roles(Role.HotelModerator)
  @ApiOperation({ summary: 'HTL-22: List bookings for my assigned hotel (guest, dates, rooms, status)' })
  list(
    @CurrentUser() user: AuthUser,
    @Param('hotelId', ParseObjectIdPipe) hotelId: string,
    @Query() query: HotelStaffBookingsQueryDto,
  ) {
    return this.bookings.listForHotel(user, hotelId, query);
  }
}

/** Official path for HTL-22 (section 8.5): GET /api/hotels/:id/reservations. */
@ApiTags('Hotel bookings')
@ApiCookieAuth('access_token')
@Controller('hotels')
export class HotelReservationsController {
  constructor(private readonly bookings: HotelStaffBookingsService) {}

  @Get(':hotelId/reservations')
  @Roles(Role.HotelModerator)
  @ApiOperation({ summary: 'HTL-22: List bookings for my assigned hotel (same as GET /hotel-bookings/hotel/:hotelId)' })
  list(
    @CurrentUser() user: AuthUser,
    @Param('hotelId', ParseObjectIdPipe) hotelId: string,
    @Query() query: HotelStaffBookingsQueryDto,
  ) {
    return this.bookings.listForHotel(user, hotelId, query);
  }
}
