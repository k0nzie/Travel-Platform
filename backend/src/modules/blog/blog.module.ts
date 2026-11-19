import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Post, PostSchema } from './schemas/post.schema';
import { Comment, CommentSchema } from './schemas/comment.schema';
import { Like, LikeSchema } from './schemas/like.schema';
import { BlogService } from './blog.service';
import { BlogController, BlogAuthorsController, BlogTagsController } from './blog.controller';

@Module({
  imports: [MongooseModule.forFeature([
    { name: Post.name, schema: PostSchema },
    { name: Comment.name, schema: CommentSchema },
    { name: Like.name, schema: LikeSchema },
  ])],
  controllers: [BlogController, BlogAuthorsController, BlogTagsController],
  providers: [BlogService],
  exports: [BlogService],
})
export class BlogModule {}
