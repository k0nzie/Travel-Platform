import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export enum PostStatus {
  Draft = 'draft',
  Published = 'published',
}
export type PostDocument = HydratedDocument<Post>;

export const MAX_TAGS = 5; // BLG-08
export const MAX_TAG_LENGTH = 30; // BLG-08

@Schema({ timestamps: true, collection: 'posts' })
export class Post {
  @Prop({ required: true, trim: true, maxlength: 150 })
  title: string;

  /** BLG-01: the post body. */
  @Prop({ required: true, maxlength: 50000 })
  content: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  author: Types.ObjectId;

  @Prop({ type: String, enum: Object.values(PostStatus), default: PostStatus.Draft, index: true })
  status: PostStatus;

  /** GEN-10: hidden by an administrator; visible only to its author and admins. */
  @Prop({ default: false, index: true })
  hidden: boolean;

  /** BLG-08: up to 5 lowercase tags, 30 characters each. */
  @Prop({
    type: [String],
    default: [],
    index: true,
    validate: {
      validator: (tags: string[]) => tags.length <= MAX_TAGS && tags.every((t) => t.length <= MAX_TAG_LENGTH),
      message: `At most ${MAX_TAGS} tags of ${MAX_TAG_LENGTH} characters each`,
    },
  })
  tags: string[];

  @Prop({ type: Date, default: null })
  publishedAt?: Date | null;

  createdAt?: Date;
  updatedAt?: Date;
}
export const PostSchema = SchemaFactory.createForClass(Post);
// Search (BLG-09) uses case-insensitive regex on title / tags / author, so no text index is needed.
// (A collection may hold only one text index; the old schema declared three, so index creation failed.)
PostSchema.index({ author: 1, status: 1, updatedAt: -1 });
PostSchema.index({ status: 1, hidden: 1, publishedAt: -1 });
