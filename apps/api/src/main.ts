import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { API_PREFIX, buildOpenApiDocument, configureApp } from './app.setup';
import { AppConfig } from './common/config/app-config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  configureApp(app);
  const config = app.get(AppConfig);
  if (config.swaggerEnabled) {
    SwaggerModule.setup(`${API_PREFIX}/docs`, app, buildOpenApiDocument(app), {
      jsonDocumentUrl: `${API_PREFIX}/docs/openapi.json`,
    });
  }
  await app.listen(config.env.PORT);
  app.get(Logger).log(`WEMS API listening on :${config.env.PORT}`);
}

void bootstrap();
