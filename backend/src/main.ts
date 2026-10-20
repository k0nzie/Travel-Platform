import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { mkdirSync } from 'fs';
import { resolve } from 'path';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { buildValidationPipe } from './common/pipes/validation';

async function bootstrap() {
  // rawBody: needed by the Stripe webhook (PAY-01) to verify signatures.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  const config = app.get(ConfigService);
  mkdirSync(resolve(config.get<string>('uploads.dir')), { recursive: true });

  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.set('trust proxy', 1);
  app.enableCors({ origin: config.get<string>('frontendUrl'), credentials: true });
  app.useGlobalPipes(buildValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Travel Planning & Booking Platform API')
    .setDescription(
      'Milestone 1 backend. Authenticate with POST /api/auth/login — the browser stores the httpOnly ' +
        'cookies and Swagger sends them automatically on every following request.',
    )
    .setVersion('1.0')
    .addCookieAuth('access_token')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { withCredentials: true, persistAuthorization: true, tagsSorter: 'alpha' },
  });

  const port = config.get<number>('port');
  await app.listen(port);
  const logger = new Logger('Bootstrap');
  logger.log(`API running on http://localhost:${port}/api`);
  logger.log(`Swagger UI on http://localhost:${port}/api/docs`);
}

bootstrap();
