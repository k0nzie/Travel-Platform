import { Body, Controller, Get, Headers, HttpCode, Param, ParseEnumPipe, Post, RawBodyRequest, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { BookingType, Role } from '../../common/constants/enums';
import { CurrentUser, Public, Roles } from '../../common/decorators';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { CreatePaymentIntentDto, TestConfirmDto } from './dto/payments.dto';
import { PaymentsService } from './payments.service';

@ApiTags('Payments')
@ApiCookieAuth('access_token')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('checkout/:bookingType/:bookingId')
  @Roles(Role.User)
  @ApiOperation({ summary: 'PAY-02: amount, hold expiry and the policies to accept before paying' })
  checkout(
    @CurrentUser() user: AuthUser,
    @Param('bookingType', new ParseEnumPipe(BookingType)) bookingType: BookingType,
    @Param('bookingId', ParseObjectIdPipe) bookingId: string,
  ) {
    return this.payments.getCheckout(user, bookingType, bookingId);
  }

  @Post('intent')
  @Roles(Role.User)
  @ApiOperation({ summary: 'PAY-01, PAY-03: start a Stripe PaymentIntent, or retry after a failed attempt' })
  createIntent(@CurrentUser() user: AuthUser, @Body() dto: CreatePaymentIntentDto) {
    return this.payments.createIntent(user, dto);
  }

  /** Called by Stripe. Signature-checked, so it needs no login. */
  @Public()
  @Post('webhook')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  webhook(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') signature: string) {
    return this.payments.handleWebhook(req.rawBody, signature);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One payment with its refunds (owner or admin)' })
  getOne(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
    return this.payments.getOne(user, id);
  }

  @Post(':id/sync')
  @Roles(Role.User)
  @HttpCode(200)
  @ApiOperation({ summary: 'PAY-01: re-read the payment from Stripe if the webhook has not arrived' })
  sync(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
    return this.payments.sync(user, id);
  }

  @Post(':id/test-confirm')
  @Roles(Role.User)
  @HttpCode(200)
  @ApiOperation({ summary: 'Test keys only: pay with a Stripe test card (no card form until Milestone 2)' })
  testConfirm(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: TestConfirmDto,
  ) {
    return this.payments.testConfirm(user, id, dto);
  }
}
