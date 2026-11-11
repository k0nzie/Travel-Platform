import { Controller, Delete, Get, HttpCode, Param, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '../../common/constants/enums';
import { CurrentUser, Roles } from '../../common/decorators';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { HotelRoomStatusQueryDto } from './dto/hotel-room-management.dto';
import { HotelRoomManagementService } from './hotel-room-management.service';

@ApiTags('Hotels')
@ApiCookieAuth('access_token')
@Controller('hotels')
export class HotelRoomManagementController {
  constructor(private readonly rooms: HotelRoomManagementService) {}

  @Get(':hotelId/rooms/status')
  @Roles(Role.HotelModerator)
  @ApiOperation({ summary: 'HTL-08: Available / Booked (reference) / Blocked for each room on chosen dates' })
  status(
    @CurrentUser() user: AuthUser,
    @Param('hotelId', ParseObjectIdPipe) hotelId: string,
    @Query() query: HotelRoomStatusQueryDto,
  ) {
    return this.rooms.statusCalendar(user, hotelId, query);
  }

  @Delete(':hotelId/rooms/:roomId')
  @Roles(Role.HotelModerator)
  @HttpCode(200)
  @ApiOperation({ summary: 'HTL-06: Permanently delete an individually bookable room only if never reserved' })
  delete(
    @CurrentUser() user: AuthUser,
    @Param('hotelId', ParseObjectIdPipe) hotelId: string,
    @Param('roomId', ParseObjectIdPipe) roomId: string,
  ) {
    return this.rooms.deleteNeverReserved(user, hotelId, roomId);
  }
}
