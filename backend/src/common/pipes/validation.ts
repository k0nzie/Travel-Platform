import { BadRequestException, ValidationError, ValidationPipe } from '@nestjs/common';

export interface FieldError {
  field: string;
  messages: string[];
}

/** Flattens nested class-validator errors into `passengers.0.fullName`-style paths. */
export function flattenValidationErrors(errors: ValidationError[], parent = ''): FieldError[] {
  const result: FieldError[] = [];
  for (const error of errors) {
    const path = parent ? `${parent}.${error.property}` : error.property;
    if (error.constraints) {
      result.push({ field: path, messages: Object.values(error.constraints) });
    }
    if (error.children?.length) {
      result.push(...flattenValidationErrors(error.children, path));
    }
  }
  return result;
}

/** Global validation: strips unknown fields, rejects extras, converts query strings to numbers etc. */
export function buildValidationPipe() {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) =>
      new BadRequestException({
        message: 'Validation failed',
        errors: flattenValidationErrors(errors),
      }),
  });
}
