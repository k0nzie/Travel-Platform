import { IsArray, IsEnum, IsOptional, IsString, ArrayMaxSize, MaxLength, MinLength } from 'class-validator';
import { PostStatus } from '../schemas/post.schema';

export class CreatePostDto {
  @IsString() @MinLength(3) @MaxLength(150) title: string;
  @IsString() @MinLength(10) @MaxLength(50000) content: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsEnum(PostStatus) status?: PostStatus;
}
export class UpdatePostDto {
  @IsOptional() @IsString() @MinLength(3) @MaxLength(150) title?: string;
  @IsOptional() @IsString() @MinLength(10) @MaxLength(50000) content?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsEnum(PostStatus) status?: PostStatus;
}
export class CreateCommentDto {
  @IsString() @MinLength(1) @MaxLength(2000) content: string;
}
export class UpdateCommentDto {
  @IsString() @MinLength(1) @MaxLength(2000) content: string;
}
