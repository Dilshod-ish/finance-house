import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ENV, readEnv, type Env } from './config/env.js';
import { ORG_CONTEXT, type OrgContext } from './org-context/org-context.js';

async function bootstrap(): Promise<void> {
  // Read before Nest starts, so a bad environment fails before anything binds.
  const env = readEnv();
  const app = await NestFactory.create(AppModule.forRoot({ env }), { bufferLogs: true });

  app.enableShutdownHooks();
  if (env.corsOrigins.length > 0) {
    app.enableCors({ origin: [...env.corsOrigins], credentials: false });
  }

  const logger = new Logger('bootstrap');
  const orgContext = app.get<OrgContext>(ORG_CONTEXT);
  logger.log(`tenant resolver: ${orgContext.describe}`);
  logger.log(`environment: ${app.get<Env>(ENV).nodeEnv}`);

  await app.listen(env.port);
  logger.log(`listening on :${env.port}`);
}

await bootstrap();
