import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/** What an image belongs to. Each has its own limit (GEN-08). */
export enum MediaOwnerType {
  Post = 'post',
  Activity = 'activity',
  Hotel = 'hotel',
  AirlineLogo = 'airline_logo',
}

export const MEDIA_LIMITS: Record<MediaOwnerType, number> = {
  [MediaOwnerType.Post]: 5,
  [MediaOwnerType.Activity]: 5,
  [MediaOwnerType.Hotel]: 5,
  [MediaOwnerType.AirlineLogo]: 1,
};

@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'media' })
export class Media {
  @Prop({ type: String, enum: Object.values(MediaOwnerType), required: true })
  ownerType: MediaOwnerType;

  @Prop({ type: Types.ObjectId, required: true })
  ownerId: Types.ObjectId;

  /** Public URL path, e.g. "/uploads/post/6f1c...e2.jpg" */
  @Prop({ required: true })
  url: string;

  /** Path relative to the upload directory (used for deletion). */
  @Prop({ required: true })
  storagePath: string;

  @Prop()
  originalName?: string;

  @Prop({ required: true })
  mimeType: string;

  @Prop({ required: true })
  size: number;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  uploadedBy: Types.ObjectId;

  createdAt?: Date;
}

export type MediaDocument = HydratedDocument<Media>;
export const MediaSchema = SchemaFactory.createForClass(Media);
MediaSchema.index({ ownerType: 1, ownerId: 1, createdAt: 1 });
