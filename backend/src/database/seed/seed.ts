import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SeedAppModule } from './seed-app.module';
import { SeedService } from './seed.service';

/** `npm run seed` — loads reference data and the admin account into MongoDB. */
async function main() {
  const app = await NestFactory.createApplicationContext(SeedAppModule, { logger: ['log', 'warn', 'error'] });
  try {
    await app.get(SeedService).run();
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  new Logger('Seed').error(err?.message ?? err, err?.stack);
  process.exit(1);
});
