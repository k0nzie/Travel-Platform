import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UploadedFiles } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { CurrentUser, Public } from '../../common/decorators';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { ImagesUpload } from '../media/media.decorators';
import { BlogService } from './blog.service';
import {
  CreateCommentDto,
  CreatePostDto,
  PostListQueryDto,
  PostSearchQueryDto,
  UpdateCommentDto,
  UpdatePostDto,
} from './dto/post.dto';

@ApiTags('Blog')
@ApiCookieAuth('access_token')
@Controller('posts')
export class BlogController {
  constructor(private readonly blog: BlogService) {}

  @Post()
  @ApiOperation({ summary: 'BLG-01, BLG-08: create a post as draft or published, with up to 5 tags' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePostDto) {
    return this.blog.create(user.id, dto);
  }

  @Public()
  @Get()
  @ApiOperation({
    summary:
      'BLG-02, BLG-09: published posts, newest first (filter by tag); use ?q= to search by title, tags or author',
  })
  list(@Query() q: PostListQueryDto & PostSearchQueryDto) {
    return q.q ? this.blog.search(q.q, q.page, q.limit) : this.blog.listPublished(q.page, q.limit, q.tag);
  }

  @Get('mine')
  @ApiOperation({ summary: 'BLG-03: my posts including drafts, with like and comment counts' })
  mine(@CurrentUser() user: AuthUser, @Query() q: PaginationQueryDto) {
    return this.blog.listMine(user.id, q.page, q.limit);
  }

  @Public()
  @Get('search')
  @ApiOperation({ summary: 'BLG-09: search by title, tags or author name, ordered by likes + comments, newest first' })
  search(@Query() q: PostSearchQueryDto) {
    return this.blog.search(q.q, q.page, q.limit);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'BLG-02: a post with author, date, body, tags, images, like and comment counts' })
  get(@CurrentUser() user: AuthUser | undefined, @Param('id', ParseObjectIdPipe) id: string) {
    return this.blog.getPost(id, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'BLG-04, BLG-08: edit my post (title, body, tags, draft/published)' })
  update(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdatePostDto) {
    return this.blog.update(user.id, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'BLG-04: delete my post with its comments, likes and images' })
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
    return this.blog.delete(user.id, id);
  }

  @Post(':id/comments')
  @ApiOperation({ summary: 'BLG-05: comment on a published post (1–500 characters)' })
  comment(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string, @Body() dto: CreateCommentDto) {
    return this.blog.addComment(user.id, id, dto.content);
  }

  @Public()
  @Get(':id/comments')
  @ApiOperation({ summary: 'BLG-05: comments on a post in chronological order' })
  comments(@Param('id', ParseObjectIdPipe) id: string, @Query() q: PaginationQueryDto) {
    return this.blog.listComments(id, q.page, q.limit);
  }

  @Patch('comments/:commentId')
  @ApiOperation({ summary: 'BLG-07: edit my comment (same as PATCH /comments/:id)' })
  updateComment(
    @CurrentUser() user: AuthUser,
    @Param('commentId', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateCommentDto,
  ) {
    return this.blog.updateComment(user.id, id, dto.content);
  }

  @Delete('comments/:commentId')
  @ApiOperation({ summary: 'BLG-07: delete my comment (same as DELETE /comments/:id)' })
  removeComment(@CurrentUser() user: AuthUser, @Param('commentId', ParseObjectIdPipe) id: string) {
    return this.blog.deleteComment(user.id, id);
  }

  @Post(':id/like')
  @HttpCode(200)
  @ApiOperation({ summary: 'BLG-06: like a post (at most once per user; repeating is harmless)' })
  like(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
    return this.blog.like(user.id, id);
  }

  @Delete(':id/like')
  @ApiOperation({ summary: 'BLG-06: remove my like' })
  unlike(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
    return this.blog.unlike(user.id, id);
  }

  @Public()
  @Get(':id/likes')
  @ApiOperation({ summary: 'BLG-06: like count' })
  likes(@Param('id', ParseObjectIdPipe) id: string) {
    return this.blog.likeCount(id);
  }

  @Post(':id/images')
  @ImagesUpload()
  @ApiOperation({ summary: 'BLG-10, GEN-08: upload up to 5 JPG/PNG images (5 MB each) to my post' })
  images(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.blog.uploadImages(user.id, id, files);
  }

  @Public()
  @Get(':id/images')
  @ApiOperation({ summary: 'BLG-10: images of a published post' })
  getImages(@Param('id', ParseObjectIdPipe) id: string) {
    return this.blog.listImages(id);
  }

  @Delete(':id/images/:imageId')
  @ApiOperation({ summary: 'BLG-10: remove an image from my post' })
  removeImage(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Param('imageId', ParseObjectIdPipe) imageId: string,
  ) {
    return this.blog.deleteImage(user.id, id, imageId);
  }
}

/** Official paths for BLG-07 (section 8.9 of the project description). */
@ApiTags('Blog')
@ApiCookieAuth('access_token')
@Controller('comments')
export class BlogCommentsController {
  constructor(private readonly blog: BlogService) {}

  @Patch(':id')
  @ApiOperation({ summary: 'BLG-07: edit my comment' })
  update(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateCommentDto) {
    return this.blog.updateComment(user.id, id, dto.content);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'BLG-07: delete my comment' })
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
    return this.blog.deleteComment(user.id, id);
  }
}

@ApiTags('Blog')
@Controller('authors')
export class BlogAuthorsController {
  constructor(private readonly blog: BlogService) {}

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'BLG-12: author page with name, join date, published posts and public itineraries' })
  author(@Param('id', ParseObjectIdPipe) id: string, @Query() q: PaginationQueryDto) {
    return this.blog.authorPage(id, q.page, q.limit);
  }
}

@ApiTags('Blog')
@Controller('tags')
export class BlogTagsController {
  constructor(private readonly blog: BlogService) {}

  @Public()
  @Get(':tag/posts')
  @ApiOperation({ summary: 'BLG-08: published posts with this tag' })
  byTag(@Param('tag') tag: string, @Query() q: PaginationQueryDto) {
    return this.blog.postsByTag(tag, q.page, q.limit);
  }
}
