import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  // Detrás de Caddy: confiar en X-Forwarded-For para el rate limit por IP.
  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-origin' } }));
  app.use(cookieParser());
  // Los artículos pueden ser largos: se amplía el límite por defecto (100 KB) del body JSON.
  app.useBodyParser('json', { limit: '1mb' });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidUnknownValues: false }));
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port, '0.0.0.0');
  Logger.log(`Kahal API escuchando en :${port}`, 'Bootstrap');
}

bootstrap();
