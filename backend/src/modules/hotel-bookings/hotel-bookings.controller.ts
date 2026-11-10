import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '../../common/constants/enums';
import { CurrentUser, Roles } from '../../common/decorators';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { CreateHotelBookingDto } from './dto/hotel-booking.dto';
import { HotelBookingsService } from './hotel-bookings.service';
import { HotelBookingListQueryDto } from './dto/hotel-booking-list.dto';
@ApiTags('Hotel bookings')
@ApiCookieAuth('access_token')
@Controller('hotel-bookings')
export class HotelBookingsController {
  constructor(private readonly bookings: HotelBookingsService) {}

  @Post('summary')
  @Roles(Role.User)
  @HttpCode(200)
  @ApiOperation({ summary: 'HTL-16: Validate room allocations and quote a hotel booking (no hold)' })
  summary(@CurrentUser() user: AuthUser, @Body() dto: CreateHotelBookingDto) {
    return this.bookings.summary(user, dto);
  }

  @Post('hold')
  @Roles(Role.User)
  @ApiOperation({ summary: 'HTL-16/18: Atomically hold all selected hotel rooms for 10 minutes' })
  hold(@CurrentUser() user: AuthUser, @Body() dto: CreateHotelBookingDto) {
    return this.bookings.createHold(user, dto);
  }

  @Get()
  @Roles(Role.User)
  @ApiOperation({
    summary: 'HTL-20: List my hotel bookings by Upcoming, Past or Cancelled',
  })
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: HotelBookingListQueryDto,
  ) {
    return this.bookings.list(user, query);
  }

  @Post(':id/cancel')
  @Roles(Role.User)
  @HttpCode(200)
  @ApiOperation({
    summary: 'HTL-21: Cancel an entire confirmed hotel booking and process its refund',
  })
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.bookings.cancel(user, id);
  }


  @Get(':id/cancellation-preview')
  @Roles(Role.User)
  @ApiOperation({
    summary: 'HTL-21: Preview refund before cancelling a hotel booking',
  })
  cancellationPreview(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.bookings.cancellationPreview(user, id);
  }


  @Get(':id')
  @ApiOperation({ summary: 'HTL-17: Hotel booking details and payment-confirmed status (owner or admin)' })
  getOne(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
    return this.bookings.getOne(user, id);
  }
}
