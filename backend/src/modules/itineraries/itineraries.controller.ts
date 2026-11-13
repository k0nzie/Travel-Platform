import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UploadedFiles } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, Public } from '../../common/decorators';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { ImagesUpload } from '../media/media.decorators';
import {
  AddDayDto,
  BudgetSummaryQueryDto,
  CloneItineraryDto,
  CreateItineraryDto,
  ItineraryFlightSearchDto,
  ItineraryHotelSearchDto,
  MyItinerariesQueryDto,
  PublicItinerarySearchDto,
  ReorderDaysDto,
  UpdateDayDto,
  UpdateItineraryDto,
} from './dto/itinerary.dto';
import {
  CreateActivityDto,
  CreateBudgetEntryDto,
  CreateTransportCostDto,
  UpdateActivityDto,
  UpdateBudgetEntryDto,
  UpdateTransportCostDto,
} from './dto/items.dto';
import { ItinerariesService } from './itineraries.service';
import { ItineraryItemsService } from './itinerary-items.service';

/**
 * HTTP only (section 8.8). Ownership is checked in the services (ACC-11):
 * someone else's private itinerary answers 404, exactly like one that does not exist.
 * Static paths (public/..., days/reorder) are declared before the :id / :dayId ones.
 */
@ApiTags('Itineraries')
@ApiCookieAuth('access_token')
@ApiBadRequestResponse({ description: 'Validation error (shared field-error format)' })
@ApiUnauthorizedResponse({ description: 'Missing or expired session' })
@ApiNotFoundResponse({ description: 'Not found, or not yours' })
@Controller('itineraries')
export class ItinerariesController {
  constructor(
    private readonly itineraries: ItinerariesService,
    private readonly items: ItineraryItemsService,
  ) {}

  // ----- public (ITN-20, ITN-21) -----

  @Public()
  @Get('public/search')
  @ApiOperation({ summary: 'ITN-20, ITN-21: search public itineraries (text, country, city, length)' })
  searchPublic(@Query() q: PublicItinerarySearchDto) {
    return this.itineraries.searchPublic(q);
  }

  @Public()
  @Get('public/:id')
  @ApiOperation({ summary: 'ITN-21: view a public itinerary (guests allowed)' })
  getPublic(@Param('id', ParseObjectIdPipe) id: string) {
    return this.itineraries.getPublic(id);
  }

  // ----- CRUD (ITN-01, ITN-03, ITN-20) -----

  @Post()
  @ApiOperation({ summary: 'ITN-01: create an itinerary (title, countries, start date)' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateItineraryDto) {
    return this.itineraries.create(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'ITN-03: list my itineraries (paginated)' })
  listMine(@CurrentUser() user: AuthUser, @Query() q: MyItinerariesQueryDto) {
    return this.itineraries.listMine(user, q);
  }

  @Get(':id')
  @ApiOperation({ summary: 'ITN-03: my itinerary with derived day numbers/dates, city groups, activities, budgets' })
  getMine(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
    return this.itineraries.getMine(user, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'ITN-01, ITN-20: edit an itinerary or switch it public/private' })
  update(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateItineraryDto) {
    return this.itineraries.update(user, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'ITN-01: delete an itinerary with its days, activities, images and budgets' })
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
    return this.itineraries.remove(user, id);
  }

  // ----- days (ITN-05, ITN-07, ITN-08, ITN-09) -----

  @Post(':id/days')
  @ApiOperation({ summary: 'ITN-05: add a day in a city (optionally at a position); later days renumber' })
  addDay(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string, @Body() dto: AddDayDto) {
    return this.itineraries.addDay(user, id, dto);
  }

  @Patch(':id/days/reorder')
  @ApiOperation({ summary: 'ITN-08: reorder days; numbers, dates and city groups are recomputed' })
  reorder(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string, @Body() dto: ReorderDaysDto) {
    return this.itineraries.reorderDays(user, id, dto);
  }

  @Patch(':id/days/:dayId')
  @ApiOperation({ summary: 'ITN-05: edit a day (city, title, notes)' })
  updateDay(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Param('dayId', ParseObjectIdPipe) dayId: string,
    @Body() dto: UpdateDayDto,
  ) {
    return this.itineraries.updateDay(user, id, dayId, dto);
  }

  @Delete(':id/days/:dayId')
  @ApiOperation({ summary: 'ITN-07: delete a day (and its activities/budgets); later days move up' })
  deleteDay(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Param('dayId', ParseObjectIdPipe) dayId: string,
  ) {
    return this.itineraries.deleteDay(user, id, dayId);
  }

  // ----- activities + budgets on a day (ITN-10, ITN-14) -----

  @Post(':id/days/:dayId/activities')
  @ApiOperation({ summary: 'ITN-10: add an activity to a day' })
  addActivity(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Param('dayId', ParseObjectIdPipe) dayId: string,
    @Body() dto: CreateActivityDto,
  ) {
    return this.items.addActivity(user, id, dayId, dto);
  }

  @Post(':id/days/:dayId/budgets')
  @ApiOperation({ summary: 'ITN-14: add a budget entry (food, accommodation, local_transport, activities)' })
  addBudget(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Param('dayId', ParseObjectIdPipe) dayId: string,
    @Body() dto: CreateBudgetEntryDto,
  ) {
    return this.items.addBudget(user, id, dayId, dto);
  }

  // ----- transport + summary (ITN-16, ITN-14, ITN-18) -----

  @Post(':id/transport-costs')
  @ApiOperation({ summary: 'ITN-16: add an intercity transport cost' })
  addTransport(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: CreateTransportCostDto,
  ) {
    return this.items.addTransport(user, id, dto);
  }

  @Public()
  @Get(':id/budget-summary')
  @ApiOperation({
    summary: 'ITN-14, ITN-18: budget totals converted to a display currency (owner, or anyone if public)',
  })
  @ApiServiceUnavailableResponse({ description: 'FX_UNAVAILABLE: no exchange rates could be retrieved' })
  budgetSummary(
    @CurrentUser() user: AuthUser | undefined,
    @Param('id', ParseObjectIdPipe) id: string,
    @Query() q: BudgetSummaryQueryDto,
  ) {
    return this.items.budgetSummary(user, id, q.currency);
  }

  // ----- clone (ITN-21) -----

  @Post(':id/clone')
  @ApiOperation({ summary: 'ITN-21: clone a public itinerary into my own private copy (keeps attribution)' })
  clone(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string, @Body() dto: CloneItineraryDto) {
    return this.itineraries.clone(user, id, dto);
  }

  // ----- search from the itinerary (ITN-25, ITN-26) -----

  @Get(':id/hotels')
  @ApiOperation({ summary: 'ITN-25: hotels in an itinerary city for the nights spent there' })
  @ApiServiceUnavailableResponse({ description: 'HOTEL_SEARCH_UNAVAILABLE until the Hotels module registers' })
  hotels(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Query() q: ItineraryHotelSearchDto,
  ) {
    return this.itineraries.searchHotels(user, id, q);
  }

  @Get(':id/flights')
  @ApiOperation({ summary: 'ITN-26: flights for a move between itinerary cities, on the right date' })
  flights(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Query() q: ItineraryFlightSearchDto,
  ) {
    return this.itineraries.searchFlights(user, id, q);
  }
}

@ApiTags('Itineraries')
@ApiCookieAuth('access_token')
@ApiBadRequestResponse({ description: 'Validation error (shared field-error format)' })
@ApiUnauthorizedResponse({ description: 'Missing or expired session' })
@ApiNotFoundResponse({ description: 'Not found, or not yours' })
@Controller('activities')
export class ActivitiesController {
  constructor(private readonly items: ItineraryItemsService) {}

  @Patch(':id')
  @ApiOperation({ summary: 'ITN-10: edit an activity' })
  update(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateActivityDto) {
    return this.items.updateActivity(user, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'ITN-10: delete an activity and its images' })
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
    return this.items.deleteActivity(user, id);
  }

  @Post(':id/images')
  @HttpCode(201)
  @ImagesUpload()
  @ApiOperation({ summary: 'ITN-12, GEN-08: upload up to 5 JPG/PNG images (5 MB each) to an activity' })
  upload(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.items.addImages(user, id, files);
  }

  @Delete(':id/images/:imageId')
  @ApiOperation({ summary: 'ITN-12: delete one activity image' })
  removeImage(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Param('imageId', ParseObjectIdPipe) imageId: string,
  ) {
    return this.items.removeImage(user, id, imageId);
  }
}

@ApiTags('Itineraries')
@ApiCookieAuth('access_token')
@ApiBadRequestResponse({ description: 'Validation error (shared field-error format)' })
@ApiUnauthorizedResponse({ description: 'Missing or expired session' })
@ApiNotFoundResponse({ description: 'Not found, or not yours' })
@Controller()
export class BudgetsController {
  constructor(private readonly items: ItineraryItemsService) {}

  @Patch('budgets/:id')
  @ApiOperation({ summary: 'ITN-14: edit a budget entry' })
  updateBudget(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateBudgetEntryDto,
  ) {
    return this.items.updateBudget(user, id, dto);
  }

  @Delete('budgets/:id')
  @ApiOperation({ summary: 'ITN-14: delete a budget entry' })
  deleteBudget(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
    return this.items.deleteBudget(user, id);
  }

  @Patch('transport-costs/:id')
  @ApiOperation({ summary: 'ITN-16: edit an intercity transport cost' })
  updateTransport(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateTransportCostDto,
  ) {
    return this.items.updateTransport(user, id, dto);
  }

  @Delete('transport-costs/:id')
  @ApiOperation({ summary: 'ITN-16: delete an intercity transport cost' })
  deleteTransport(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
    return this.items.deleteTransport(user, id);
  }
}
