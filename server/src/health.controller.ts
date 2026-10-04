import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

// 헬스체크 (모니터링/프록시용이라 rate limit 제외)
@SkipThrottle()
@Controller('health')
export class HealthController {
  @Get()
  health() {
    return { ok: true };
  }
}
