import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UploadedFiles } from '@nestjs/common';

import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Role } from '../../common/constants/enums';
import { CurrentUser, Public, Roles } from '../../common/decorators';

import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';

import { ImagesUpload } from '../media/media.decorators';

import { CreateHotelDto, UpdateHotelDto } from './dto/hotels.dto';

import {
  BlockRoomDatesDto,
  CreateRoomAvailabilityDto,
  CreateRoomDto,
  UpdateRoomDto,
  UpdateRoomAvailabilityDto,
} from './dto/rooms.dto';

import { PutHotelPoliciesDto } from './dto/hotel-policies.dto';

import { AvailableHotelRoomsQueryDto, HotelSearchQueryDto } from './dto/hotel-search.dto';

import { HotelsService } from './hotels.service';
import { RoomsService } from './rooms.service';
import { HotelSearchService } from './hotel-search.service';

@ApiTags('Hotels')
@ApiCookieAuth('access_token')
@Controller('hotels')
export class HotelsController {
  constructor(
    private readonly hotelsService: HotelsService,
    private readonly roomsService: RoomsService,
    private readonly hotelSearchService: HotelSearchService,
  ) {}

  // ==================================================
  // HTL-01: Hotel management
  // ==================================================

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
   * HTL-01: Hotel moderators can edit
   * only their assigned hotel.
   */
  @Patch(':id')
  @Roles(Role.HotelModerator)
  @ApiOperation({
    summary: 'HTL-01: Moderator edits assigned hotel',
  })
  updateHotel(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateHotelDto) {
    return this.hotelsService.updateHotel(user, id, dto);
  }

  // ==================================================
  // HTL-11 / HTL-12: Public hotel search
  // ==================================================

  /**
   * HTL-11: Search hotels by destination,
   * stay dates, guests, and room count.
   *
   * HTL-12: Filter by nightly price and rating,
   * and sort the resulting hotels.
   *
   * This route is intentionally placed before
   * the dynamic GET /hotels/:id route.
   */
  @Get('search')
  @Public()
  @ApiOperation({
    summary: 'HTL-11/12: Search hotels',
    description:
      'Search active hotels using destination, dates, ' +
      'guest count, and requested room count. Supports ' +
      'nightly price filters, minimum rating, and sorting. ' +
      'Inactive rooms and overlapping maintenance blocks ' +
      'are excluded. Confirmed booking and unexpired ' +
      'payment-hold conflicts require booking integration.',
  })
  searchHotels(@Query() query: HotelSearchQueryDto) {
    return this.hotelSearchService.searchHotels(query);
  }

  // ==================================================
  // HTL-02: Public hotel details
  // ==================================================

  /**
   * HTL-02: Guests and registered users can
   * view hotel details.
   */
  @Get(':id')
  @Public()
  @ApiOperation({
    summary: 'HTL-02: Get hotel profile',
    description:
      'Returns the hotel profile, photos, amenities, ' +
      'check-in/check-out times, cancellation policy, ' +
      'and current rating summary.',
  })
  getHotel(@Param('id', ParseObjectIdPipe) id: string) {
    return this.hotelsService.findHotel(id);
  }

  // ==================================================
  // HTL-01 / GEN-08: Hotel photos
  // ==================================================

  /**
   * HTL-01 / GEN-08:
   * Upload up to 5 JPG/PNG photos,
   * maximum 5 MB each.
   */
  @Post(':id/images')
  @Roles(Role.HotelModerator)
  @ImagesUpload()
  @ApiOperation({
    summary: 'HTL-01 / GEN-08: Upload hotel photos',
    description:
      'Only the assigned hotel moderator can upload photos. ' +
      'Maximum 5 images per hotel, JPG/PNG only, ' +
      '5 MB per image.',
  })
  uploadImages(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.hotelsService.uploadImages(user, id, files);
  }

  /**
   * HTL-01: Remove a photo
   * from the assigned hotel.
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

  // ==================================================
  // HTL-03: Room creation
  // ==================================================

  /**
   * HTL-03: Add an individually bookable
   * room to the assigned hotel.
   */
  @Post(':id/rooms')
  @Roles(Role.HotelModerator)
  @ApiOperation({
    summary: 'HTL-03: Moderator creates a room',
    description:
      'Creates a room in the assigned hotel with a ' +
      'unique room number or name, room type, beds, ' +
      'maximum occupancy, and nightly price.',
  })
  createRoom(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string, @Body() dto: CreateRoomDto) {
    return this.roomsService.createRoom(user, id, dto);
  }

  // ==================================================
  // HTL-15: Public available rooms
  // ==================================================

  /**
   * HTL-15: View rooms that are available
   * according to published room schedules.
   *
   * Includes nightly and total stay prices.
   */
  @Get(':id/rooms/available')
  @Public()
  @ApiOperation({
    summary: 'HTL-15: View available hotel rooms',
    description:
      'Returns rooms available for the selected hotel ' +
      'and stay dates, including room type, beds, ' +
      'occupancy, nightly price, and total stay price. ' +
      'Inactive rooms and blocked dates are excluded. ' +
      'Reservation and payment-hold checks will be ' +
      'integrated with the hotel booking module.',
  })
  listAvailableRooms(@Param('id', ParseObjectIdPipe) hotelId: string, @Query() query: AvailableHotelRoomsQueryDto) {
    return this.hotelSearchService.availableRooms(hotelId, query);
  }

  // ==================================================
  // HTL-04: Room availability
  // ==================================================

  /**
   * HTL-04: Define a non-overlapping period
   * when a hotel room is bookable.
   *
   * startDate is inclusive.
   * endDate is exclusive.
   */
  @Post(':id/rooms/:roomId/availability')
  @Roles(Role.HotelModerator)
  @ApiOperation({
    summary: 'HTL-04: Add room availability range',
    description:
      'Only the assigned hotel moderator can add ' +
      'bookable dates. startDate is inclusive and ' +
      'endDate is exclusive. Overlapping ranges ' +
      'are rejected.',
  })
  addRoomAvailability(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) hotelId: string,
    @Param('roomId', ParseObjectIdPipe) roomId: string,
    @Body() dto: CreateRoomAvailabilityDto,
  ) {
    return this.roomsService.addAvailability(user, hotelId, roomId, dto);
  }

  // ==================================================
  // HTL-05: Room editing
  // ==================================================

  /**
   * HTL-05: Edit room details.
   */
  @Patch(':id/rooms/:roomId')
  @Roles(Role.HotelModerator)
  @ApiOperation({
    summary: 'HTL-05: Edit room details',
    description:
      'The assigned hotel moderator can update beds, ' +
      'maximum occupancy, and nightly price. ' +
      'Only provided fields are changed.',
  })
  updateRoom(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) hotelId: string,
    @Param('roomId', ParseObjectIdPipe) roomId: string,
    @Body() dto: UpdateRoomDto,
  ) {
    return this.roomsService.updateRoom(user, hotelId, roomId, dto);
  }

  /**
   * HTL-05: Edit an existing room
   * availability period.
   */
  @Patch(':id/rooms/:roomId/availability')
  @Roles(Role.HotelModerator)
  @ApiOperation({
    summary: 'HTL-05: Edit room availability dates',
    description:
      'Replaces an existing availability range, ' + 'rejects overlaps, and detects concurrent ' + 'schedule changes.',
  })
  updateRoomAvailability(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) hotelId: string,
    @Param('roomId', ParseObjectIdPipe) roomId: string,
    @Body() dto: UpdateRoomAvailabilityDto,
  ) {
    return this.roomsService.updateAvailability(user, hotelId, roomId, dto);
  }

  // ==================================================
  // HTL-06: Room blocking
  // ==================================================

  /**
   * HTL-06: Block a room for a date range.
   */
  @Post(':id/rooms/:roomId/blocks')
  @Roles(Role.HotelModerator)
  @ApiOperation({
    summary: 'HTL-06: Block hotel room dates',
    description:
      'Allows the assigned hotel moderator to block ' +
      'a date range for maintenance or operational reasons. ' +
      'Overlapping blocks are rejected. Booking-conflict ' +
      'protection requires hotel-booking integration.',
  })
  blockRoomDates(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) hotelId: string,
    @Param('roomId', ParseObjectIdPipe) roomId: string,
    @Body() dto: BlockRoomDatesDto,
  ) {
    return this.roomsService.blockRoomDates(user, hotelId, roomId, dto);
  }

  // ==================================================
  // HTL-06: Room deactivation
  // ==================================================

  /**
   * HTL-06: Deactivate a hotel room
   * without deleting its data.
   */
  @Patch(':id/rooms/:roomId/deactivate')
  @Roles(Role.HotelModerator)
  @ApiOperation({
    summary: 'HTL-06: Deactivate a hotel room',
    description:
      'Allows the assigned hotel moderator to deactivate ' +
      'an active room without deleting its information. ' +
      'Booking-related safeguards require integration.',
  })
  deactivateRoom(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) hotelId: string,
    @Param('roomId', ParseObjectIdPipe) roomId: string,
  ) {
    return this.roomsService.deactivateRoom(user, hotelId, roomId);
  }

  // ==================================================
  // HTL-09 / HTL-10: Hotel policies
  // ==================================================

  /**
   * HTL-09: Set check-in and check-out times.
   *
   * HTL-10: Set cancellation policy tiers.
   */
  @Put(':id/policies')
  @Roles(Role.HotelModerator)
  @ApiOperation({
    summary: 'HTL-09/10: Set hotel policies',
    description:
      'The assigned hotel moderator sets check-in ' +
      'and check-out times and cancellation tiers. ' +
      'Each cancellation threshold must be a unique ' +
      'non-negative whole number. Refund selection uses ' +
      'the highest threshold not exceeding days remaining.',
  })
  setHotelPolicies(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) hotelId: string,
    @Body() dto: PutHotelPoliciesDto,
  ) {
    return this.hotelsService.setPolicies(user, hotelId, dto);
  }
}
