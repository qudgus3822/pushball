// [신설: 2026-11-10 13:18, 김병현 작성] 실시간 서버(realtime-server 의 /pushball 네임스페이스) 연동 타입.
//   위쪽은 씬이 쓰는 타입이고, 아래쪽 "서버 전송 형식"은 pushballConnection 만 쓰는 타입이다.

/** 로비의 방 id. 서버에 고정된 3개만 있다. */
export type PushballRoomId = 'room-1' | 'room-2' | 'room-3';

/** 방마다 지금 들어와 있는 플레이어 수(0~2). */
export type LobbyRoomCounts = Record<PushballRoomId, number>;

/** 로비 화면이 받는 상태. */
export interface LobbySnapshot {
  /** 서버와 연결돼 있는지. false 면 rooms 는 마지막으로 받은 값이다. */
  connected: boolean;
  rooms: LobbyRoomCounts;
}

/** 내가 들어간 방의 플레이어 명단. */
export interface RoomPlayers {
  /** 내 플레이어 id. 재연결하면 바뀐다. */
  myId: string;
  /** 방 안 플레이어 id 목록(나 포함). 들어온 순서다. */
  playerIds: readonly string[];
}

/** enterRoom 결과. unreachable 은 서버에 연결할 수 없거나 응답이 없는 경우다. */
export type RoomEnterOutcome = 'entered' | 'room-full' | 'unreachable';

/**
 * 계속 바뀌는 상태 메시지. 최신 값만 의미가 있어서 syncState 로 보낸다(빈도 제한, 중간 값은 버림).
 * 좌표는 화면 크기에 대한 비율(0~1)이다. 보낸 쪽 화면 기준이라 받는 쪽이 180도 뒤집어 쓴다.
 */
export interface GameStateMessages {
  'ball-position': { relativeX: number; relativeY: number; vx: number; vy: number };
  'paddle-position': { relativeX: number; relativeY: number };
}

/** 한 번씩 일어나는 사건 메시지. 하나라도 빠지면 안 돼서 sendEvent 로 바로 보낸다. */
export interface GameEventMessages {
  'game-start': Record<string, never>;
  /** scorer 는 보낸 쪽 기준이다('me' = 보낸 사람이 득점). */
  'goal-scored': { scorer: 'me' | 'opponent'; myScore: number; opponentScore: number };
  'game-over': { loserId: string };
}

/** 상대와 주고받는 모든 게임 메시지(종류 -> 본문). */
export type GameMessages = GameStateMessages & GameEventMessages;

/* ---------------- 서버 전송 형식(pushballConnection 전용) ---------------- */

/** lobby:watch ack. */
export type LobbyWatchAck = { ok: true; rooms: LobbyRoomCounts } | { ok: false; error: string };

/** 서버가 방 인원이 바뀔 때 로비 구독자에게 보내는 lobby:rooms 이벤트. */
export interface LobbyRoomsEvent {
  rooms: LobbyRoomCounts;
}

/** room:enter ack. */
export type RoomEnterAck = { ok: true; room: PushballRoomId; players: string[] } | { ok: false; error: string };

/** 서버가 방 명단이 바뀔 때 보내는 room:players 이벤트. */
export interface RoomPlayersEvent {
  room: PushballRoomId;
  players: string[];
}

/** 상대가 보낸 game:relay 이벤트. */
export interface GameRelayEvent {
  kind: string;
  data: unknown;
  from: string;
}
