import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, Schema as MongooseSchema } from 'mongoose';
export type CommentDocument = HydratedDocument<Comment>;
@Schema({ timestamps: true, collection: 'comments' })
export class Comment {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Post', required: true, index: true })
  post: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  author: Types.ObjectId;
  @Prop({ required: true, trim: true, minlength: 1, maxlength: 2000 })
  content: string;
}
export const CommentSchema = SchemaFactory.createForClass(Comment);
CommentSchema.index({ post: 1, createdAt: -1 });
