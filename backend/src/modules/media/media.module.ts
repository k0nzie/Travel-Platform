import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MediaService } from './media.service';
import { Media, MediaSchema } from './schemas/media.schema';

/**
 * Global. No controller of its own: each feature exposes its own upload route
 * (e.g. POST /api/posts/:id/images) after checking ownership, then calls MediaService.
 * Files are served statically at /uploads/... (see AppModule).
 */
@Global()
@Module({
  imports: [MongooseModule.forFeature([{ name: Media.name, schema: MediaSchema }])],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}
