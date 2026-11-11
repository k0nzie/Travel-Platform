import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '../../common/constants/enums';
import { CurrentUser, Public, Roles } from '../../common/decorators';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { CreateHotelReviewDto, HotelReviewsQueryDto, UpdateHotelReviewDto } from './dto/hotel-review.dto';
import { HotelReviewsService } from './hotel-reviews.service';

@ApiTags('Hotel reviews')
@ApiCookieAuth('access_token')
@Controller('hotel-reviews')
export class HotelReviewsController {
  constructor(private readonly reviews: HotelReviewsService) {}

  @Post()
  @Roles(Role.User)
  @ApiOperation({ summary: 'HTL-23: Rate a completed hotel reservation once' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateHotelReviewDto) {
    return this.reviews.create(user, dto);
  }

  @Patch(':id')
  @Roles(Role.User)
  @ApiOperation({ summary: 'HTL-23: Edit your own reservation rating and/or review' })
  update(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateHotelReviewDto) {
    return this.reviews.update(user, id, dto);
  }

  @Delete(':id')
  @Roles(Role.User)
  @HttpCode(200)
  @ApiOperation({ summary: 'HTL-23: Delete your own reservation review and recalculate rating' })
  delete(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
    return this.reviews.delete(user, id);
  }
}

@ApiTags('Hotels')
@Controller('hotels')
export class PublicHotelReviewsController {
  constructor(private readonly reviews: HotelReviewsService) {}

  @Get(':hotelId/reviews')
  @Public()
  @ApiOperation({ summary: 'HTL-02/24: Public hotel rating count, average and newest reviews (paginated)' })
  list(@Param('hotelId', ParseObjectIdPipe) hotelId: string, @Query() query: HotelReviewsQueryDto) {
    return this.reviews.listPublic(hotelId, query);
  }
}
