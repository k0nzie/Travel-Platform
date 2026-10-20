import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import configuration from '../../config/configuration';
import { validateEnv } from '../../config/env.validation';
import { AuditModule } from '../../modules/audit/audit.module';
import { ReferenceDataModule } from '../../modules/reference-data/reference-data.module';
import { SeedModule } from './seed.module';

/** Minimal module graph for `npm run seed` (no HTTP server, no cron jobs). */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration], validate: validateEnv, cache: true }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({ uri: config.get<string>('mongo.uri') }),
    }),
    ReferenceDataModule,
    AuditModule,
    SeedModule,
  ],
})
export class SeedAppModule {}
