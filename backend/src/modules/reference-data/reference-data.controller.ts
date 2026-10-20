import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { AirportQueryDto, AttractionQueryDto, CityQueryDto, CountryQueryDto } from './dto/reference-query.dto';
import { ReferenceDataService } from './reference-data.service';

@ApiTags('Reference data')
@Public()
@Controller()
export class ReferenceDataController {
  constructor(private readonly reference: ReferenceDataService) {}

  @Get('reference/countries')
  @ApiOperation({ summary: 'GEN-12: list supported countries' })
  countries(@Query() query: CountryQueryDto) {
    return this.reference.listCountries(query);
  }

  @Get('reference/cities')
  @ApiOperation({ summary: 'GEN-12: list cities (filter by country, search by name)' })
  cities(@Query() query: CityQueryDto) {
    return this.reference.listCities(query);
  }

  @Get('reference/currencies')
  @ApiOperation({ summary: 'GEN-12: list supported currencies' })
  currencies() {
    return this.reference.listCurrencies();
  }

  @Get('reference/attractions')
  @ApiOperation({ summary: 'List attractions (filter by city / country)' })
  attractions(@Query() query: AttractionQueryDto) {
    return this.reference.listAttractions(query);
  }

  @Get('airports')
  @ApiOperation({ summary: 'FLT-02: predefined airport list (IATA, name, city, country, time zone)' })
  airports(@Query() query: AirportQueryDto) {
    return this.reference.listAirports(query);
  }

  @Get('airports/:id')
  @ApiOperation({ summary: 'FLT-02: airport details' })
  airport(@Param('id', ParseObjectIdPipe) id: string) {
    return this.reference.getAirportById(id);
  }
}
