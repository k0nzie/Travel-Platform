import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, Schema as MongooseSchema } from 'mongoose';

export enum PostStatus { Draft = 'draft', Published = 'published' }
export type PostDocument = HydratedDocument<Post>;

@Schema({ timestamps: true, collection: 'posts' })
export class Post {
  @Prop({ required: true, trim: true, maxlength: 150, index: 'text' })
  title: string;

  @Prop({ required: true, maxlength: 50000, index: 'text' })
  content: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  author: Types.ObjectId;

  @Prop({ type: String, enum: Object.values(PostStatus), default: PostStatus.Draft, index: true })
  status: PostStatus;

  @Prop({ type: [String], default: [], index: true })
  tags: string[];

  @Prop({ default: null })
  publishedAt?: Date | null;
}
export const PostSchema = SchemaFactory.createForClass(Post);
PostSchema.index({ title: 'text', content: 'text', tags: 'text' });
PostSchema.index({ author: 1, status: 1, updatedAt: -1 });
PostSchema.index({ status: 1, publishedAt: -1 });
