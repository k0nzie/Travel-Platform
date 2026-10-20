import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AccountHooksService } from './account-hooks.service';
import { Session, SessionSchema } from './schemas/session.schema';
import { User, UserSchema } from './schemas/user.schema';
import { SessionsService } from './sessions.service';
import { AdminUsersController, UsersController } from './users.controller';
import { UsersService } from './users.service';

const USER_MODELS = MongooseModule.forFeature([
  { name: User.name, schema: UserSchema },
  { name: Session.name, schema: SessionSchema },
]);

/**
 * Import UsersModule wherever you need UsersService, AccountHooksService or the
 * User model (e.g. to populate authors, or count bookings by user).
 */
@Module({
  imports: [USER_MODELS],
  controllers: [UsersController, AdminUsersController],
  providers: [UsersService, SessionsService, AccountHooksService],
  exports: [UsersService, SessionsService, AccountHooksService, USER_MODELS],
})
export class UsersModule {}
