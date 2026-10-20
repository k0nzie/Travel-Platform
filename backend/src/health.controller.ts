import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Connection } from 'mongoose';
import { Public } from './common/decorators';

const STATES = ['disconnected', 'connected', 'connecting', 'disconnecting'];

@ApiTags('Health')
@Public()
@Controller('health')
export class HealthController {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  @Get()
  @ApiOperation({ summary: 'API and database status' })
  check() {
    const db = STATES[this.connection.readyState] ?? 'unknown';
    return { status: db === 'connected' ? 'ok' : 'degraded', database: db, time: new Date().toISOString() };
  }
}
