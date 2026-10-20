import { applyDecorators, UseInterceptors } from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes } from '@nestjs/swagger';
import { memoryStorage } from 'multer';

const FIVE_MB = 5 * 1024 * 1024;

/**
 * Multipart upload of up to `maxCount` images in the field "images" (GEN-08).
 * Files are kept in memory so MediaService can validate them before anything
 * touches the disk. Pair with `@UploadedFiles() files: Express.Multer.File[]`.
 */
export function ImagesUpload(maxCount = 5) {
  return applyDecorators(
    UseInterceptors(
      FilesInterceptor('images', maxCount, {
        storage: memoryStorage(),
        limits: { fileSize: FIVE_MB, files: maxCount },
      }),
    ),
    ApiConsumes('multipart/form-data'),
    ApiBody({
      schema: {
        type: 'object',
        required: ['images'],
        properties: {
          images: { type: 'array', items: { type: 'string', format: 'binary' }, maxItems: maxCount },
        },
      },
    }),
  );
}

/** Single image in the field "image" (airline logo). Pair with `@UploadedFile() file`. */
export function SingleImageUpload() {
  return applyDecorators(
    UseInterceptors(FileInterceptor('image', { storage: memoryStorage(), limits: { fileSize: FIVE_MB, files: 1 } })),
    ApiConsumes('multipart/form-data'),
    ApiBody({
      schema: {
        type: 'object',
        required: ['image'],
        properties: { image: { type: 'string', format: 'binary' } },
      },
    }),
  );
}
