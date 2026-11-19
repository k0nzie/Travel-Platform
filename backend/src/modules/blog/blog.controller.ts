import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFiles } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Public } from '../../common/decorators';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { ImagesUpload } from '../media/media.decorators';
import { BlogService } from './blog.service';
import { CreateCommentDto, CreatePostDto, UpdateCommentDto, UpdatePostDto } from './dto/post.dto';

@ApiTags('Blog')
@ApiCookieAuth('access_token')
@Controller('posts')
export class BlogController {
  constructor(private readonly blog: BlogService) {}

  @Post()
  @ApiOperation({ summary: 'BLG-01: create a draft or published post' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePostDto) { return this.blog.create(user.id, dto); }

  @Public()
  @Get()
  @ApiOperation({ summary: 'BLG-02: list published posts' })
  list(@Query('page') page = 1, @Query('limit') limit = 10) { return this.blog.listPublished(+page, +limit); }

  @Get('mine')
  @ApiOperation({ summary: 'BLG-03: list own posts including drafts' })
  mine(@CurrentUser() user: AuthUser) { return this.blog.listMine(user.id); }

  @Public()
  @Get('search')
  @ApiOperation({ summary: 'BLG-09: search published posts by relevance' })
  search(@Query('q') q: string, @Query('page') page = 1, @Query('limit') limit = 10) { return this.blog.search(q, +page, +limit); }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'BLG-02: view a published post with images and engagement counts' })
  get(@Param('id', ParseObjectIdPipe) id: string): Promise<any> {
  return this.blog.getPost(id);
}

  @Patch(':id')
  @ApiOperation({ summary: 'BLG-04: edit own post' })
  update(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdatePostDto) { return this.blog.update(user.id, id, dto); }

  @Delete(':id')
  @ApiOperation({ summary: 'BLG-04: delete own post and associated media/comments/likes' })
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) { return this.blog.delete(user.id, id); }

  @Post(':id/comments')
  @ApiOperation({ summary: 'BLG-05: add a comment' })
  comment(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string, @Body() dto: CreateCommentDto) { return this.blog.addComment(user.id, id, dto.content); }

  @Public()
  @Get(':id/comments')
  @ApiOperation({ summary: 'BLG-05: list comments on a published post' })
  comments(@Param('id', ParseObjectIdPipe) id: string) { return this.blog.listComments(id); }

  @Patch('comments/:commentId')
  @ApiOperation({ summary: 'BLG-07: edit own comment' })
  updateComment(@CurrentUser() user: AuthUser, @Param('commentId', ParseObjectIdPipe) id: string, @Body() dto: UpdateCommentDto) { return this.blog.updateComment(user.id, id, dto.content); }

  @Delete('comments/:commentId')
  @ApiOperation({ summary: 'BLG-07: delete own comment' })
  removeComment(@CurrentUser() user: AuthUser, @Param('commentId', ParseObjectIdPipe) id: string) { return this.blog.deleteComment(user.id, id); }

  @Post(':id/like')
  @ApiOperation({ summary: 'BLG-06: like or unlike a post (one like per user)' })
  like(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) { return this.blog.toggleLike(user.id, id); }

  @Public()
  @Get(':id/likes')
  @ApiOperation({ summary: 'BLG-06: get like count' })
  likes(@Param('id', ParseObjectIdPipe) id: string) { return this.blog.likeCount(id); }

  @Post(':id/images')
  @ImagesUpload()
  @ApiOperation({ summary: 'BLG-10: upload up to five JPG/PNG images to own post' })
  images(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string, @UploadedFiles() files: Express.Multer.File[]) {
    return this.blog.uploadImages(user.id, id, files);
  }

  @Public()
  @Get(':id/images')
  @ApiOperation({ summary: 'BLG-10: list images on a published post' })
  getImages(@Param('id', ParseObjectIdPipe) id: string) { return this.blog.listImages(id); }

  @Delete(':id/images/:imageId')
  @ApiOperation({ summary: 'BLG-10: delete an image from own post' })
  removeImage(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string, @Param('imageId', ParseObjectIdPipe) imageId: string) {
    return this.blog.deleteImage(user.id, id, imageId);
  }
}

@ApiTags('Blog Authors')
@Controller('authors')
export class BlogAuthorsController {
  constructor(private readonly blog: BlogService) {}
  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'BLG-12: public author page with published posts' })
  author(@Param('id', ParseObjectIdPipe) id: string, @Query('page') page = 1, @Query('limit') limit = 10) {
    return this.blog.authorPage(id, +page, +limit);
  }
}

@ApiTags('Blog Tags')
@Controller('tags')
export class BlogTagsController {
  constructor(private readonly blog: BlogService) {}
  @Public()
  @Get(':tag/posts')
  @ApiOperation({ summary: 'BLG-08: list published posts for a tag' })
  byTag(@Param('tag') tag: string, @Query('page') page = 1, @Query('limit') limit = 10) {
    return this.blog.postsByTag(tag, +page, +limit);
  }
}
