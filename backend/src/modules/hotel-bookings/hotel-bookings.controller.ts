import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '../../common/constants/enums';
import { CurrentUser, Roles } from '../../common/decorators';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { CreateHotelBookingDto } from './dto/hotel-booking.dto';
import { HotelBookingsService } from './hotel-bookings.service';

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

  @Get(':id')
  @ApiOperation({ summary: 'HTL-17: Hotel booking details and payment-confirmed status (owner or admin)' })
  getOne(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
    return this.bookings.getOne(user, id);
  }
}
