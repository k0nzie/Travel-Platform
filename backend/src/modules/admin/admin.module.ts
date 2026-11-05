import { Module } from '@nestjs/common';
import { FlightsModule } from '../flights/flights.module';
import { UsersModule } from '../users/users.module';
import { AdminProvidersController } from './admin-providers.controller';
import { AdminProvidersService } from './admin-providers.service';

/**
 * Admin features (Person 6). Sits on top of the provider modules: it imports them, they never
 * import admin. Person 4 adds HotelsModule here for hotel (de)activation.
 */
@Module({
  imports: [FlightsModule, UsersModule],
  controllers: [AdminProvidersController],
  providers: [AdminProvidersService],
})
export class AdminModule {}
