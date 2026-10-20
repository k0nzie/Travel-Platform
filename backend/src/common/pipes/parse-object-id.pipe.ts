import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { isValidObjectId } from 'mongoose';

/** `@Param('id', ParseObjectIdPipe) id: string` — rejects malformed ids with 400. */
@Injectable()
export class ParseObjectIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!isValidObjectId(value) || !/^[a-f\d]{24}$/i.test(value)) {
      throw new BadRequestException(`"${value}" is not a valid id`);
    }
    return value;
  }
}
