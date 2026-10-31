import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { resolve } from 'path';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { HealthController } from './health.controller';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { MediaModule } from './modules/media/media.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ReferenceDataModule } from './modules/reference-data/reference-data.module';
import { UsersModule } from './modules/users/users.module';
import { FlightsModule } from './modules/flights/flights.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration], validate: validateEnv, cache: true }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({ uri: config.get<string>('mongo.uri') }),
    }),
    // Cron jobs (hold expiry FLT-22 / HTL-18, "Departed" / "Completed" status updates, daily FX refresh).
    ScheduleModule.forRoot(),
    // GEN-08: uploaded images are served at /uploads/<type>/<file>
    ServeStaticModule.forRoot({
      rootPath: resolve(process.env.UPLOAD_DIR ?? 'uploads'),
      serveRoot: '/uploads',
      serveStaticOptions: { index: false, fallthrough: false },
    }),

    // ---- Person 1: foundation + shared services ----
    ReferenceDataModule,
    AuditModule,
    NotificationsModule,
    MediaModule,
    UsersModule,
    AuthModule,

    // ---- Teammates add their modules below ----
    FlightsModule,             // Person 2
    // FlightBookingsModule,   // Person 3
    // PaymentsModule,         // Person 3
    // HotelsModule,           // Person 4
    // HotelBookingsModule,    // Person 4
    // ItinerariesModule,      // Person 5
    // ExchangeRatesModule,    // Person 5
    // BlogModule,             // Person 6
    // ReportsModule,          // Person 6
    // AdminModule,            // Person 6
  ],
  controllers: [HealthController],
})
export class AppModule {}
