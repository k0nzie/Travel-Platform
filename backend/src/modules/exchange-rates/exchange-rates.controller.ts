import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators';
import { ConvertQueryDto, LatestRatesQueryDto } from './exchange-rates.dto';
import { ExchangeRatesService } from './exchange-rates.service';

/** ITN-18 helper endpoints (section 8.10 "exchange-rate retrieval"). Rates come from the backend cache only. */
@ApiTags('Exchange rates')
@ApiServiceUnavailableResponse({ description: 'FX_UNAVAILABLE: FXRatesAPI failed and nothing is cached' })
@Controller('exchange-rates')
export class ExchangeRatesController {
  constructor(private readonly fx: ExchangeRatesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'ITN-18: latest exchange rates for a base currency (daily cached)' })
  @ApiOkResponse({ description: '{ base, ratesAt, stale, rates: { EUR: 0.92, ... } }' })
  latest(@Query() q: LatestRatesQueryDto) {
    return this.fx.latest(q.base ?? 'USD', q.symbols);
  }

  @Public()
  @Get('convert')
  @ApiOperation({ summary: 'ITN-18: convert an amount in minor units between two supported currencies' })
  convert(@Query() q: ConvertQueryDto) {
    return this.fx.convert(q.amountMinor, q.from, q.to);
  }
}
