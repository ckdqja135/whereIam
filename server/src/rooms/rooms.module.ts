import { Module } from '@nestjs/common';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';

// 실시간 대결 방 (2~4인, 롱 폴링). 상태는 메모리에만 둔다.
@Module({
  controllers: [RoomsController],
  providers: [RoomsService],
})
export class RoomsModule {}
