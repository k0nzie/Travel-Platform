import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, Schema as MongooseSchema } from 'mongoose';
export type LikeDocument = HydratedDocument<Like>;
@Schema({ timestamps: true, collection: 'likes' })
export class Like {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Post', required: true })
  post: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  user: Types.ObjectId;
}
export const LikeSchema = SchemaFactory.createForClass(Like);
LikeSchema.index({ post: 1, user: 1 }, { unique: true });
