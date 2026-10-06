import { Body, Controller, Get, Headers, HttpCode, Param, ParseIntPipe, Post, Query, Res } from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CreateRoomDto, JoinRoomDto } from './dto/create-room.dto';
import { RoomReadyDto, RoomSettingsDto, RoomStartDto } from './dto/lobby.dto';
import { RoomAwayDto, RoomChatDto, RoomGuessDto, RoomPositionDto } from './dto/round.dto';
import type { RoomJoinResponse, RoomState } from './room.types';
import { RoomsService } from './rooms.service';

// 방 만들기는 IP당 1분에 10회, 참가는 20회
const CREATE_THROTTLE = { default: { ttl: 60_000, limit: 10 } };
const JOIN_THROTTLE = { default: { ttl: 60_000, limit: 20 } };
// 본인 확인용 헤더 (방 만들기/참가 응답의 token)
const TOKEN_HEADER = 'x-player-token';

@Controller('rooms')
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Post()
  @HttpCode(201)
  @Throttle(CREATE_THROTTLE)
  create(@Body() dto: CreateRoomDto): RoomJoinResponse {
    return this.rooms.create(dto);
  }

  @Post(':code/join')
  @HttpCode(201)
  @Throttle(JOIN_THROTTLE)
  join(@Param('code') code: string, @Body() dto: JoinRoomDto): RoomJoinResponse {
    return this.rooms.join(code, dto);
  }

  // 롱 폴링 채널이라 rate limit 에서 제외
  @Get(':code/state')
  @SkipThrottle()
  async state(
    @Param('code') code: string,
    @Headers(TOKEN_HEADER) token: string | undefined,
    @Query('since', new ParseIntPipe({ optional: true })) since: number | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RoomState> {
    // 응답 전에 연결이 끊기면(클라이언트가 요청 취소) 대기를 바로 끝낸다.
    // req 의 'close' 는 Node 16+ 에서 본문을 다 읽은 시점에도 발생하므로 res 쪽 이벤트를 쓴다.
    const abort = new AbortController();
    res.on('close', () => {
      if (!res.writableFinished) abort.abort();
    });
    return this.rooms.getState(code, token, since, abort.signal);
  }

  @Post(':code/ready')
  @HttpCode(200)
  ready(@Param('code') code: string, @Headers(TOKEN_HEADER) token: string | undefined, @Body() dto: RoomReadyDto) {
    return this.rooms.setReady(code, token, dto.ready);
  }

  @Post(':code/settings')
  @HttpCode(200)
  settings(
    @Param('code') code: string,
    @Headers(TOKEN_HEADER) token: string | undefined,
    @Body() dto: RoomSettingsDto,
  ): RoomState {
    return this.rooms.updateSettings(code, token, dto.settings);
  }

  @Post(':code/start')
  @HttpCode(200)
  start(@Param('code') code: string, @Headers(TOKEN_HEADER) token: string | undefined, @Body() dto: RoomStartDto) {
    return this.rooms.start(code, token, dto);
  }

  @Post(':code/position')
  @HttpCode(204)
  position(
    @Param('code') code: string,
    @Headers(TOKEN_HEADER) token: string | undefined,
    @Body() dto: RoomPositionDto,
  ): void {
    this.rooms.reportPosition(code, token, dto);
  }

  @Post(':code/guess')
  @HttpCode(200)
  guess(@Param('code') code: string, @Headers(TOKEN_HEADER) token: string | undefined, @Body() dto: RoomGuessDto) {
    return this.rooms.guess(code, token, dto);
  }

  @Post(':code/away')
  @HttpCode(204)
  away(@Param('code') code: string, @Headers(TOKEN_HEADER) token: string | undefined, @Body() dto: RoomAwayDto): void {
    this.rooms.reportAway(code, token, dto);
  }

  @Post(':code/chat')
  @HttpCode(200)
  chat(@Param('code') code: string, @Headers(TOKEN_HEADER) token: string | undefined, @Body() dto: RoomChatDto): RoomState {
    return this.rooms.chat(code, token, dto.text);
  }

  @Post(':code/next')
  @HttpCode(200)
  next(@Param('code') code: string, @Headers(TOKEN_HEADER) token: string | undefined): RoomState {
    return this.rooms.next(code, token);
  }

  @Post(':code/rematch')
  @HttpCode(200)
  rematch(@Param('code') code: string, @Headers(TOKEN_HEADER) token: string | undefined): RoomState {
    return this.rooms.rematch(code, token);
  }

  @Post(':code/leave')
  @HttpCode(204)
  leave(@Param('code') code: string, @Headers(TOKEN_HEADER) token: string | undefined): void {
    this.rooms.leave(code, token);
  }
}
