import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseEnumPipe,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { ApiCookieAuth, ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { BookingType, Role } from '../../common/constants/enums';
import { CurrentUser, Public, Roles } from '../../common/decorators';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { AcceptPoliciesDto, CreatePaymentDto, TestConfirmDto } from './dto/payments.dto';
import { PaymentsService } from './payments.service';

/** PAY-02: shared by flight and hotel bookings (:type = flight | hotel). */
@ApiTags('Payments')
@ApiCookieAuth('access_token')
@Roles(Role.User)
@Controller('bookings/:type/:id')
export class BookingPoliciesController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('policies')
  @ApiOperation({ summary: 'PAY-02: amount, hold expiry and the provider policies to accept before paying' })
  policies(
    @CurrentUser() user: AuthUser,
    @Param('type', new ParseEnumPipe(BookingType)) type: BookingType,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.payments.getCheckout(user, type, id);
  }

  @Post('accept-policies')
  @HttpCode(200)
  @ApiOperation({ summary: 'PAY-02: accept the policies; stored with a timestamp. Required before POST /payments' })
  accept(
    @CurrentUser() user: AuthUser,
    @Param('type', new ParseEnumPipe(BookingType)) type: BookingType,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() _dto: AcceptPoliciesDto,
  ) {
    return this.payments.acceptPolicies(user, type, id);
  }
}

@ApiTags('Payments')
@ApiCookieAuth('access_token')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post()
  @Roles(Role.User)
  @ApiOperation({ summary: 'PAY-01: start the Stripe PaymentIntent for a pending booking (policies accepted first)' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePaymentDto) {
    return this.payments.startPayment(user, dto);
  }

  /** Called by Stripe. Signature-checked, so it needs no login. */
  @Public()
  @Post('webhook')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  webhook(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') signature: string) {
    return this.payments.handleWebhook(req.rawBody, signature);
  }

  @Post(':id/retry')
  @Roles(Role.User)
  @HttpCode(200)
  @ApiOperation({ summary: 'PAY-01: retry a failed payment while the 10-minute hold lasts' })
  retry(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
    return this.payments.retry(user, id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'PAY-01/PAY-03: payment status with its refunds (owner or admin)' })
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
  testConfirm(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string, @Body() dto: TestConfirmDto) {
    return this.payments.testConfirm(user, id, dto);
  }
}

@ApiTags('Payments')
@ApiCookieAuth('access_token')
@Controller('refunds')
export class RefundsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get(':id')
  @ApiOperation({ summary: 'PAY-03: refund amount and status (Pending, Refunded, Failed); owner or admin' })
  getOne(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
    return this.payments.getRefund(user, id);
  }
}
