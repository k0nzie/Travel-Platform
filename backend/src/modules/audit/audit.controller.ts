import { Controller, Get, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '../../common/constants/enums';
import { Roles } from '../../common/decorators';
import { AuditService } from './audit.service';
import { AuditQueryDto } from './dto/audit-query.dto';

@ApiTags('Admin')
@ApiCookieAuth('access_token')
@Roles(Role.Admin)
@Controller('admin/audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'GEN-07: list admin audit log entries (newest first)' })
  list(@Query() query: AuditQueryDto) {
    return this.audit.list(query);
  }
}
