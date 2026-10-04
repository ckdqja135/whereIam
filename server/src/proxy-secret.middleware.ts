import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';

// 프론트(Vercel)의 서버 사이드 프록시만 이 서버를 호출할 수 있도록 공유 비밀키를 검사한다.
// PROXY_SECRET 이 설정되어 있으면 /health 를 제외한 모든 요청에 X-Proxy-Secret 헤더가 일치해야 한다.
// 비어 있으면 검사하지 않는다 (nginx/Caddy 등 HTTPS 프록시 뒤에서 직접 호출하는 구성).
export function createProxySecretMiddleware(secret: string | undefined) {
  const logger = new Logger('ProxySecret');
  const expected = secret?.trim();

  if (!expected) {
    logger.warn('PROXY_SECRET 이 비어 있어 비밀키 검사를 하지 않습니다. 포트가 외부에 열려 있다면 설정을 권장합니다.');
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }

  const expectedBuf = Buffer.from(expected);
  return (req: Request, res: Response, next: NextFunction) => {
    // 미들웨어 마운트 경로 기준인 req.path 대신 전체 경로로 비교한다
    const path = req.originalUrl.split('?')[0];
    if (path === '/health') return next();

    const given = req.header('x-proxy-secret') ?? '';
    const givenBuf = Buffer.from(given);
    const ok = givenBuf.length === expectedBuf.length && timingSafeEqual(givenBuf, expectedBuf);
    if (!ok) {
      res.status(401).json({ statusCode: 401, message: '허용되지 않은 요청입니다.' });
      return;
    }
    next();
  };
}
