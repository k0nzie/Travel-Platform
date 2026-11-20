import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ItinerariesModule } from '../itineraries/itineraries.module';
import { UsersModule } from '../users/users.module';
import { BlogAuthorsController, BlogCommentsController, BlogController, BlogTagsController } from './blog.controller';
import { BlogService } from './blog.service';
import { Comment, CommentSchema } from './schemas/comment.schema';
import { Like, LikeSchema } from './schemas/like.schema';
import { Post, PostSchema } from './schemas/post.schema';

/** Blog (BLG-01 to BLG-12). Uses UsersModule (ACC-12, author search) and ItinerariesModule (BLG-12). */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Post.name, schema: PostSchema },
      { name: Comment.name, schema: CommentSchema },
      { name: Like.name, schema: LikeSchema },
    ]),
    UsersModule,
    ItinerariesModule,
  ],
  controllers: [BlogController, BlogCommentsController, BlogAuthorsController, BlogTagsController],
  providers: [BlogService],
  exports: [BlogService],
})
export class BlogModule {}
