import { CreateRoomAvailabilityDto, CreateRoomDto } from './dto/rooms.dto';
import { RoomsService } from './rooms.service';

import { Body, Controller, Delete, Get, Param, Patch, Post, UploadedFiles } from '@nestjs/common';

import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Role } from '../../common/constants/enums';

import { CurrentUser, Public, Roles } from '../../common/decorators';

import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';

import { ImagesUpload } from '../media/media.decorators';

import { CreateHotelDto, UpdateHotelDto } from './dto/hotels.dto';

import { HotelsService } from './hotels.service';

@ApiTags('Hotels')
@ApiCookieAuth('access_token')
@Controller('hotels')
export class HotelsController {
  constructor(
    private readonly hotelsService: HotelsService,
    private readonly roomsService: RoomsService,
  ) {}

  /**
   * HTL-01: Only an administrator can create a hotel.
   */
  @Post()
  @Roles(Role.Admin)
  @ApiOperation({
    summary: 'HTL-01: Admin creates a hotel profile',
  })
  createHotel(@CurrentUser() user: AuthUser, @Body() dto: CreateHotelDto) {
    return this.hotelsService.createHotel(user, dto);
  }

  /**
   * HTL-02: Guests and registered users can view hotel details.
   */
  @Get(':id')
  @Public()
  @ApiOperation({
    summary: 'HTL-02: Get hotel profile (basic details)',
  })
  getHotel(@Param('id', ParseObjectIdPipe) id: string) {
    return this.hotelsService.findHotel(id);
  }

  /**
   * HTL-01: Hotel moderators can edit only their assigned hotel.
   */
  @Patch(':id')
  @Roles(Role.HotelModerator)
  @ApiOperation({
    summary: 'HTL-01: Moderator edits assigned hotel',
  })
  updateHotel(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateHotelDto) {
    return this.hotelsService.updateHotel(user, id, dto);
  }

  /**
   * HTL-01 / GEN-08:
   * Upload up to 5 JPG/PNG photos, maximum 5 MB each.
   */
  @Post(':id/images')
  @Roles(Role.HotelModerator)
  @ImagesUpload()
  @ApiOperation({
    summary: 'HTL-01 / GEN-08: Upload hotel photos',
    description:
      'Only the assigned hotel moderator can upload photos. ' +
      'Maximum 5 images per hotel, JPG/PNG only, 5 MB per image.',
  })
  uploadImages(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.hotelsService.uploadImages(user, id, files);
  }

  /**
   * HTL-01: Remove a photo from the assigned hotel.
   */
  @Delete(':id/images/:imageId')
  @Roles(Role.HotelModerator)
  @ApiOperation({
    summary: 'HTL-01: Remove a hotel photo',
    description: 'Only the assigned hotel moderator can delete a photo.',
  })
  removeImage(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Param('imageId', ParseObjectIdPipe) imageId: string,
  ) {
    return this.hotelsService.removeImage(user, id, imageId);
  }
  /**
   * HTL-03: Add an individually bookable hotel room.
   */
  @Post(':id/rooms')
  @Roles(Role.HotelModerator)
  @ApiOperation({
    summary: 'HTL-03: Moderator creates a room in assigned hotel',
  })
  createRoom(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string, @Body() dto: CreateRoomDto) {
    return this.roomsService.createRoom(user, id, dto);
  }

  /**
   * HTL-04: Define when a hotel room is bookable.
   */
  @Post(':id/rooms/:roomId/availability')
  @Roles(Role.HotelModerator)
  @ApiOperation({
    summary: 'HTL-04: Add a non-overlapping room availability range',
    description:
      'Only the assigned hotel moderator can add bookable dates. ' +
      'startDate is inclusive and endDate is exclusive. ' +
      'Overlapping ranges are rejected.',
  })
  addRoomAvailability(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) hotelId: string,
    @Param('roomId', ParseObjectIdPipe) roomId: string,
    @Body() dto: CreateRoomAvailabilityDto,
  ) {
    return this.roomsService.addAvailability(user, hotelId, roomId, dto);
  }
}
