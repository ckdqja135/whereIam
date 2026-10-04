import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  // Caddy/Nginx 뒤에서 동작하므로 X-Forwarded-For 를 신뢰해야 rate limit 이 실제 IP 기준으로 동작한다.
  // (프록시 1단계만 신뢰)
  app.set('trust proxy', 1);

  // CORS_ORIGINS 에 등록된 origin 만 허용
  const origins = (config.get<string>('CORS_ORIGINS') ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: origins.length > 0 ? origins : false,
    methods: ['GET', 'POST'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // SIGINT/SIGTERM(pm2 reload 등) 시 DB 를 깔끔하게 닫기 위해
  app.enableShutdownHooks();

  const port = Number(config.get<string>('PORT') ?? 4000);
  // 기본은 127.0.0.1: Caddy/Nginx 를 거쳐서만 접근하고 4000 포트를 외부에 직접 노출하지 않는다.
  // 프록시 없이 IP로 직접 테스트할 때만 HOST=0.0.0.0 으로 바꾼다.
  const host = config.get<string>('HOST') ?? '127.0.0.1';
  await app.listen(port, host);
  Logger.log(`whereIam 서버 실행 중: http://${host}:${port} (CORS: ${origins.join(', ') || '없음'})`, 'Bootstrap');
}

void bootstrap();
