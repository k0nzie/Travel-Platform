import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { MAX_TAG_LENGTH, MAX_TAGS, PostStatus } from '../schemas/post.schema';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const trimTags = ({ value }: { value: unknown }) =>
  Array.isArray(value) ? value.map((t) => (typeof t === 'string' ? t.trim().toLowerCase() : t)) : value;

export class CreatePostDto {
  @ApiProperty({ example: 'Three days in Cairo', maxLength: 150 })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  title: string;

  @ApiProperty({ description: 'BLG-01: the post body', maxLength: 50000 })
  @IsString()
  @MinLength(10)
  @MaxLength(50000)
  content: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['egypt', 'food'],
    description: 'BLG-08: up to 5 tags, 30 characters each',
  })
  @IsOptional()
  @Transform(trimTags)
  @IsArray()
  @ArrayMaxSize(MAX_TAGS)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(MAX_TAG_LENGTH, { each: true })
  tags?: string[];

  @ApiPropertyOptional({ enum: PostStatus, default: PostStatus.Draft })
  @IsOptional()
  @IsEnum(PostStatus)
  status?: PostStatus;
}

export class UpdatePostDto {
  @ApiPropertyOptional({ maxLength: 150 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  title?: string;

  @ApiPropertyOptional({ maxLength: 50000 })
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(50000)
  content?: string;

  @ApiPropertyOptional({ type: [String], description: 'BLG-08: up to 5 tags, 30 characters each' })
  @IsOptional()
  @Transform(trimTags)
  @IsArray()
  @ArrayMaxSize(MAX_TAGS)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(MAX_TAG_LENGTH, { each: true })
  tags?: string[];

  @ApiPropertyOptional({ enum: PostStatus })
  @IsOptional()
  @IsEnum(PostStatus)
  status?: PostStatus;
}

/** BLG-05 / BLG-07: non-empty, at most 500 characters. */
export class CreateCommentDto {
  @ApiProperty({ maxLength: 500 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  content: string;
}
export class UpdateCommentDto extends CreateCommentDto {}

export class PostListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'BLG-02 / BLG-08: only posts with this tag' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(MAX_TAG_LENGTH)
  tag?: string;
}

export class PostSearchQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'BLG-09: keyword matched in the title, tags or author name' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;
}
