import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ChallengesModule } from './challenges/challenges.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health.controller';
import { createProxySecretMiddleware } from './proxy-secret.middleware';
import { RoomsModule } from './rooms/rooms.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // 전역 rate limit: IP당 1분에 60회 (생성/제출 API 는 컨트롤러에서 더 엄격하게 제한)
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 60 }]),
    DatabaseModule,
    ChallengesModule,
    RoomsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule implements NestModule {
  constructor(private readonly config: ConfigService) {}

  configure(consumer: MiddlewareConsumer) {
    // 프론트 프록시의 공유 비밀키 검사 (PROXY_SECRET 이 설정된 경우에만 동작)
    consumer.apply(createProxySecretMiddleware(this.config.get<string>('PROXY_SECRET'))).forRoutes('*path');
  }
}
