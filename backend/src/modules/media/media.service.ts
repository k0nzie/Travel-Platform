import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { Model, Types } from 'mongoose';
import { join, resolve } from 'path';
import { Media, MEDIA_LIMITS, MediaDocument, MediaOwnerType } from './schemas/media.schema';

const ALLOWED: Record<string, { ext: string; magic: number[] }> = {
  'image/jpeg': { ext: 'jpg', magic: [0xff, 0xd8, 0xff] },
  'image/png': { ext: 'png', magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
};

export interface SaveImagesInput {
  files: Express.Multer.File[];
  ownerType: MediaOwnerType;
  ownerId: string | Types.ObjectId;
  uploadedBy: string;
}

/**
 * GEN-08 image uploads, shared by posts (BLG-10), activities (ITN-12), hotels (HTL-01)
 * and airline logos (FLT-01).
 *
 * Usage in a controller (see media.decorators.ts):
 *
 *   @Post(':id/images')
 *   @ImagesUpload()                      // multipart field "images", up to 5 files, 5 MB each
 *   upload(@Param('id') id, @UploadedFiles() files, @CurrentUser() user) {
 *     // check ownership first, then:
 *     return this.media.saveImages({ files, ownerType: MediaOwnerType.Post, ownerId: id, uploadedBy: user.id });
 *   }
 */
@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly root: string;
  private readonly maxBytes: number;

  constructor(
    @InjectModel(Media.name) private readonly mediaModel: Model<MediaDocument>,
    config: ConfigService,
  ) {
    this.root = resolve(config.get<string>('uploads.dir'));
    this.maxBytes = config.get<number>('uploads.maxFileSizeBytes');
  }

  get uploadRoot() {
    return this.root;
  }

  /** Validates type (by real file bytes, not just the header), size and per-owner count, then stores. */
  async saveImages({ files, ownerType, ownerId, uploadedBy }: SaveImagesInput) {
    if (!files?.length) throw new BadRequestException('No images uploaded. Use the "images" field.');
    files.forEach((file) => this.validate(file));

    const owner = new Types.ObjectId(String(ownerId));
    const limit = MEDIA_LIMITS[ownerType];
    const existing = await this.mediaModel.countDocuments({ ownerType, ownerId: owner }).exec();
    if (existing + files.length > limit) {
      throw new BadRequestException(
        `Too many images: ${ownerType} allows at most ${limit} (currently ${existing}, uploading ${files.length})`,
      );
    }

    const dir = join(this.root, ownerType);
    await fs.mkdir(dir, { recursive: true });

    const saved: MediaDocument[] = [];
    try {
      for (const file of files) {
        const { ext } = ALLOWED[file.mimetype];
        const filename = `${randomUUID()}.${ext}`;
        const storagePath = `${ownerType}/${filename}`;
        await fs.writeFile(join(this.root, storagePath), file.buffer);
        saved.push(
          await this.mediaModel.create({
            ownerType,
            ownerId: owner,
            url: `/uploads/${storagePath}`,
            storagePath,
            originalName: file.originalname?.slice(0, 200),
            mimeType: file.mimetype,
            size: file.size,
            uploadedBy: new Types.ObjectId(uploadedBy),
          }),
        );
      }
    } catch (err) {
      // Roll back partial uploads so the owner never ends up half-updated.
      await Promise.all(saved.map((m) => this.removeDoc(m)));
      throw err;
    }
    return saved.map((m) => this.toResponse(m));
  }

  list(ownerType: MediaOwnerType, ownerId: string | Types.ObjectId) {
    return this.mediaModel
      .find({ ownerType, ownerId: new Types.ObjectId(String(ownerId)) })
      .sort({ createdAt: 1 })
      .lean()
      .exec()
      .then((docs) => docs.map((d) => this.toResponse(d)));
  }

  /** Removes one image, checking it belongs to that owner (ownership of the owner is the caller's job). */
  async remove(ownerType: MediaOwnerType, ownerId: string | Types.ObjectId, mediaId: string) {
    if (!Types.ObjectId.isValid(mediaId)) throw new NotFoundException('Image not found');
    const doc = await this.mediaModel
      .findOne({ _id: mediaId, ownerType, ownerId: new Types.ObjectId(String(ownerId)) })
      .exec();
    if (!doc) throw new NotFoundException('Image not found');
    await this.removeDoc(doc);
    return { deleted: true };
  }

  /** Call when the owner itself is deleted (post, activity, hotel, ...). */
  async removeAllFor(ownerType: MediaOwnerType, ownerId: string | Types.ObjectId) {
    const docs = await this.mediaModel
      .find({ ownerType, ownerId: new Types.ObjectId(String(ownerId)) })
      .exec();
    await Promise.all(docs.map((d) => this.removeDoc(d)));
    return { deleted: docs.length };
  }

  /**
   * ITN-21 clone: copies an owner's images to a new owner (new files, so deleting
   * the original never breaks the clone).
   */
  async copyAll(ownerType: MediaOwnerType, fromOwnerId: string | Types.ObjectId, toOwnerId: string | Types.ObjectId, uploadedBy: string) {
    const docs = await this.mediaModel.find({ ownerType, ownerId: new Types.ObjectId(String(fromOwnerId)) }).exec();
    const copies = [];
    for (const doc of docs) {
      const ext = doc.storagePath.split('.').pop();
      const storagePath = `${ownerType}/${randomUUID()}.${ext}`;
      try {
        await fs.copyFile(join(this.root, doc.storagePath), join(this.root, storagePath));
      } catch {
        this.logger.warn(`Missing file while copying ${doc.storagePath}`);
        continue;
      }
      const copy = await this.mediaModel.create({
        ownerType,
        ownerId: new Types.ObjectId(String(toOwnerId)),
        url: `/uploads/${storagePath}`,
        storagePath,
        originalName: doc.originalName,
        mimeType: doc.mimeType,
        size: doc.size,
        uploadedBy: new Types.ObjectId(uploadedBy),
      });
      copies.push(this.toResponse(copy));
    }
    return copies;
  }

  private validate(file: Express.Multer.File) {
    const name = file.originalname ?? 'file';
    const rule = ALLOWED[file.mimetype];
    if (!rule) {
      throw new BadRequestException(`"${name}" is not a JPG or PNG image`);
    }
    if (file.size > this.maxBytes) {
      throw new BadRequestException(`"${name}" is larger than 5 MB`);
    }
    const header = file.buffer?.subarray(0, rule.magic.length);
    if (!header || !rule.magic.every((byte, i) => header[i] === byte)) {
      throw new BadRequestException(`"${name}" is not a valid ${rule.ext.toUpperCase()} file`);
    }
  }

  private async removeDoc(doc: MediaDocument) {
    await fs.unlink(join(this.root, doc.storagePath)).catch(() => undefined);
    await this.mediaModel.deleteOne({ _id: doc._id }).exec();
  }

  private toResponse(doc: { _id: any; url: string; mimeType: string; size: number; createdAt?: Date }) {
    return { id: String(doc._id), url: doc.url, mimeType: doc.mimeType, size: doc.size, createdAt: doc.createdAt };
  }
}
