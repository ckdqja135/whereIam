import { Module } from '@nestjs/common';
import { QuizModule } from '../quiz/quiz.module';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';

// 실시간 대결 방 (2~4인, 롱 폴링). 상태는 메모리에만 둔다. 퀴즈 문제는 QuizModule 의 문제 풀에서 만든다.
@Module({
  imports: [QuizModule],
  controllers: [RoomsController],
  providers: [RoomsService],
})
export class RoomsModule {}
