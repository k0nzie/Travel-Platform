import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export enum ReportContentType {
  Post = 'post',
  Comment = 'comment',
  Review = 'review',
  Itinerary = 'itinerary',
}
export enum ReportStatus {
  Pending = 'pending',
  Dismissed = 'dismissed',
  Resolved = 'resolved',
}

@Schema({ timestamps: true, collection: 'content_reports' })
export class ContentReport {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  reporterId: Types.ObjectId;
  @Prop({ type: String, enum: Object.values(ReportContentType), required: true })
  contentType: ReportContentType;
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  contentId: Types.ObjectId;
  @Prop({ required: true, trim: true, minlength: 5, maxlength: 1000 })
  reason: string;
  @Prop({ type: String, enum: Object.values(ReportStatus), default: ReportStatus.Pending, index: true })
  status: ReportStatus;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  reviewedBy?: Types.ObjectId;
  @Prop({ maxlength: 1000 })
  resolutionNote?: string;
  @Prop()
  reviewedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}
export type ContentReportDocument = HydratedDocument<ContentReport>;
export const ContentReportSchema = SchemaFactory.createForClass(ContentReport);
ContentReportSchema.index({ status: 1, createdAt: -1 });
// GEN-09: a user may report the same item only once, whatever the report's status.
ContentReportSchema.index({ reporterId: 1, contentType: 1, contentId: 1 }, { unique: true });
