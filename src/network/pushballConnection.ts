// [신설: 2026-11-10 13:18, 김병현 작성] 실시간 서버(realtime-server 의 /pushball 네임스페이스) 연결 모듈.
//
// 씬은 "로비 구독, 방 입장/퇴장, 방 명단 구독, 상대와 게임 메시지 주고받기"만 안다.
// 아래 일은 이 모듈이 숨긴다.
//   - 소켓 생성 시점: 처음 쓸 때 연결한다(import 만으로는 연결하지 않음).
//   - 재연결: Socket.IO 가 다시 붙으면 로비 구독과 방 입장을 다시 보낸다(재연결하면 내 id 가 바뀐다).
//   - 전송 빈도: 위치 같은 상태 메시지는 종류마다 30Hz 로 줄여 최신 값만 보낸다. 서버 relay 한도(초당 100)를 넘지 않기 위해서다.
//   - 서버 전송 형식: 이벤트 이름, ack 모양, 타임아웃.
//
// 사용 예:
//   const stop = pushballConnection.watchLobby((lobby) => render(lobby));
//   if ((await pushballConnection.enterRoom('room-1')) === 'entered') { ... }
//   pushballConnection.onRelay('goal-scored', (goal) => ...);
//   pushballConnection.syncState('ball-position', { relativeX, relativeY, vx, vy });
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import type {
  GameEventMessages,
  GameMessages,
  GameRelayEvent,
  GameStateMessages,
  LobbyRoomsEvent,
  LobbySnapshot,
  LobbyWatchAck,
  PushballRoomId,
  RoomEnterAck,
  RoomEnterOutcome,
  RoomPlayers,
  RoomPlayersEvent,
} from "../types/realtime";

/** 기본 서버 주소. 로컬 서버로 바꿀 때는 VITE_WS_URL 을 쓴다(예: ws://localhost:8080). Vite 가 빌드 때 값을 코드에 넣는다. */
const DEFAULT_SERVER_URL = "wss://ws.qudgus.win";

const NAMESPACE = "/pushball";

/** ack 를 기다리는 최대 시간. 끊긴 동안 보낸 요청은 재연결 뒤 전송되므로 이 시간 안에 붙지 못하면 unreachable 이 된다. */
const ACK_TIMEOUT_MS = 5_000;

/** 상태 메시지 종류마다 최소 전송 간격(약 30Hz). 공과 패들 두 종류를 합쳐 초당 60번 안쪽이다. */
const STATE_SYNC_INTERVAL_MS = 33;

class PushballConnection {
  private socket: Socket | undefined;

  private lobby: LobbySnapshot = { connected: false, rooms: { "room-1": 0, "room-2": 0, "room-3": 0 } };
  private readonly lobbyListeners = new Set<(lobby: LobbySnapshot) => void>();
  /** 지금 연결에서 lobby:watch 를 보냈는지. 서버는 연결이 끊길 때까지 구독을 유지한다. */
  private lobbyWatchedOnServer = false;

  private currentRoom: PushballRoomId | undefined;
  private roomPlayerIds: readonly string[] = [];
  private readonly playersListeners = new Set<(players: RoomPlayers) => void>();

  private readonly relayListeners = new Map<string, Set<(data: unknown) => void>>();
  private readonly lastStateSentAt = new Map<keyof GameStateMessages, number>();
  private readonly pendingStateData = new Map<keyof GameStateMessages, unknown>();
  private readonly stateFlushTimers = new Map<keyof GameStateMessages, ReturnType<typeof setTimeout>>();

  /**
   * 로비 상태를 구독한다. 구독하자마자 지금 상태를 한 번 받는다.
   * 이후 연결이 끊기거나(connected: false) 방 인원이 바뀔 때마다 다시 받는다.
   * @returns 구독 해제 함수. 씬이 끝날 때 부른다.
   */
  watchLobby(listener: (lobby: LobbySnapshot) => void): () => void {
    this.lobbyListeners.add(listener);
    const socket = this.ensureSocket();
    listener(this.lobby);
    // 연결 전이면 connect 핸들러가 구독을 보낸다.
    if (socket.connected && !this.lobbyWatchedOnServer) void this.watchLobbyOnServer(socket);
    return () => {
      this.lobbyListeners.delete(listener);
    };
  }

  /**
   * 방에 들어간다. 다른 방에 있었으면 서버가 이전 방에서 뺀다.
   * 정원(2명)은 서버가 판정한다. 성공하면 onPlayersChanged 구독자가 새 명단을 받는다.
   */
  async enterRoom(room: PushballRoomId): Promise<RoomEnterOutcome> {
    const ack = await this.requestEnter(this.ensureSocket(), room);
    if (ack === undefined) return "unreachable";
    if (!ack.ok) return ack.error === "room-full" ? "room-full" : "unreachable";

    this.currentRoom = room;
    this.applyRoomPlayers(ack.players);
    return "entered";
  }

  /** 지금 방에서 나간다. 보내지 못한 상태 메시지는 버린다. 방에 없으면 아무 일도 하지 않는다. */
  exitRoom(): void {
    if (this.currentRoom === undefined) return;
    this.currentRoom = undefined;
    this.roomPlayerIds = [];
    this.discardPendingStates();
    this.socket?.emit("room:exit");
  }

  /**
   * 방 명단을 구독한다. 방에 들어가 있으면 구독하자마자 지금 명단을 한 번 받는다.
   * 이후 상대가 들어오거나 나가거나, 재연결로 내 id 가 바뀔 때마다 다시 받는다.
   * @returns 구독 해제 함수.
   */
  onPlayersChanged(listener: (players: RoomPlayers) => void): () => void {
    this.playersListeners.add(listener);
    if (this.currentRoom !== undefined) listener(this.roomPlayersSnapshot());
    return () => {
      this.playersListeners.delete(listener);
    };
  }

  /** 사건 메시지(시작, 득점 등)를 같은 방 상대에게 바로 보낸다. 방에 없으면 버린다. */
  sendEvent<K extends keyof GameEventMessages>(kind: K, data: GameEventMessages[K]): void {
    if (this.currentRoom === undefined) return;
    this.socket?.emit("game:relay", { kind, data });
  }

  /**
   * 상태 메시지(위치 등)를 같은 방 상대에게 보낸다. 매 프레임 불러도 된다.
   * 종류마다 STATE_SYNC_INTERVAL_MS 에 한 번만 보내고, 그 사이 값은 가장 최근 것만 남겨 간격이 끝날 때 보낸다.
   * 연결이 끊긴 동안의 값은 쌓아 두지 않고 버린다.
   */
  syncState<K extends keyof GameStateMessages>(kind: K, data: GameStateMessages[K]): void {
    if (this.currentRoom === undefined) return;
    const elapsedMs = Date.now() - (this.lastStateSentAt.get(kind) ?? 0);
    const flushScheduled = this.stateFlushTimers.has(kind);
    if (!flushScheduled && elapsedMs >= STATE_SYNC_INTERVAL_MS) {
      this.emitState(kind, data);
      return;
    }

    this.pendingStateData.set(kind, data);
    if (flushScheduled) return;
    const timer = setTimeout(() => {
      this.stateFlushTimers.delete(kind);
      const latestData = this.pendingStateData.get(kind);
      this.pendingStateData.delete(kind);
      if (latestData !== undefined && this.currentRoom !== undefined) this.emitState(kind, latestData);
    }, STATE_SYNC_INTERVAL_MS - elapsedMs);
    this.stateFlushTimers.set(kind, timer);
  }

  /**
   * 상대가 보낸 게임 메시지를 종류별로 구독한다. 내가 보낸 메시지는 서버가 나에게 돌려보내지 않는다.
   * @returns 구독 해제 함수.
   */
  onRelay<K extends keyof GameMessages>(kind: K, listener: (data: GameMessages[K]) => void): () => void {
    let listeners = this.relayListeners.get(kind);
    if (listeners === undefined) {
      listeners = new Set();
      this.relayListeners.set(kind, listeners);
    }
    // 본문 모양은 같은 게임 클라이언트끼리의 약속이라 서버 검증 없이 그대로 넘긴다.
    const untypedListener = listener as (data: unknown) => void;
    listeners.add(untypedListener);
    return () => {
      listeners.delete(untypedListener);
    };
  }

  private ensureSocket(): Socket {
    if (this.socket !== undefined) return this.socket;

    const serverUrl = (import.meta.env.VITE_WS_URL || DEFAULT_SERVER_URL).replace(/\/+$/, "");
    // 서버가 long-polling 을 끄고 WebSocket 만 받는다.
    const socket = io(`${serverUrl}${NAMESPACE}`, { transports: ["websocket"] });

    socket.on("connect", () => {
      if (this.lobbyListeners.size > 0) void this.watchLobbyOnServer(socket);
      if (this.currentRoom !== undefined) void this.reenterRoom(socket, this.currentRoom);
    });
    socket.on("disconnect", () => {
      // 서버는 끊긴 소켓을 방과 로비 구독에서 뺀다. 재연결하면 connect 핸들러가 다시 보낸다.
      this.lobbyWatchedOnServer = false;
      this.updateLobby({ connected: false, rooms: this.lobby.rooms });
    });
    socket.on("lobby:rooms", (event: LobbyRoomsEvent) => {
      this.updateLobby({ connected: true, rooms: event.rooms });
    });
    socket.on("room:players", (event: RoomPlayersEvent) => {
      // 방을 옮기는 중에 이전 방 소식이 늦게 올 수 있다.
      if (event.room === this.currentRoom) this.applyRoomPlayers(event.players);
    });
    socket.on("game:relay", (event: GameRelayEvent) => {
      this.relayListeners.get(event.kind)?.forEach((listener) => listener(event.data));
    });

    this.socket = socket;
    return socket;
  }

  private async watchLobbyOnServer(socket: Socket): Promise<void> {
    this.lobbyWatchedOnServer = true;
    try {
      const ack: LobbyWatchAck = await socket.timeout(ACK_TIMEOUT_MS).emitWithAck("lobby:watch");
      if (ack.ok) {
        this.updateLobby({ connected: true, rooms: ack.rooms });
        return;
      }
    } catch {
      // 타임아웃이다. 아래에서 표시를 되돌려 다음 connect 나 watchLobby 호출 때 다시 보낸다.
    }
    this.lobbyWatchedOnServer = false;
  }

  /** room:enter 를 보내고 ack 를 기다린다. 응답이 없으면 undefined. */
  private async requestEnter(socket: Socket, room: PushballRoomId): Promise<RoomEnterAck | undefined> {
    try {
      return await socket.timeout(ACK_TIMEOUT_MS).emitWithAck("room:enter", { room });
    } catch {
      return undefined;
    }
  }

  /** 재연결 뒤 원래 방에 다시 들어간다. 그 사이 자리를 뺏겼으면 방에서 나간 것으로 처리하고 빈 명단을 알린다. */
  private async reenterRoom(socket: Socket, room: PushballRoomId): Promise<void> {
    const ack = await this.requestEnter(socket, room);
    // 기다리는 동안 씬이 방을 나갔거나 다른 방에 들어갔으면 결과를 무시한다.
    if (this.currentRoom !== room) return;
    if (ack?.ok) {
      this.applyRoomPlayers(ack.players);
      return;
    }
    this.currentRoom = undefined;
    this.discardPendingStates();
    this.applyRoomPlayers([]);
  }

  private emitState<K extends keyof GameStateMessages>(kind: K, data: unknown): void {
    this.lastStateSentAt.set(kind, Date.now());
    // volatile: 연결이 없으면 버퍼에 쌓지 않고 버린다. 재연결 뒤 옛 위치가 한꺼번에 가지 않게 하기 위해서다.
    this.socket?.volatile.emit("game:relay", { kind, data });
  }

  private discardPendingStates(): void {
    this.stateFlushTimers.forEach((timer) => clearTimeout(timer));
    this.stateFlushTimers.clear();
    this.pendingStateData.clear();
  }

  private updateLobby(lobby: LobbySnapshot): void {
    this.lobby = lobby;
    this.lobbyListeners.forEach((listener) => listener(lobby));
  }

  private applyRoomPlayers(playerIds: readonly string[]): void {
    this.roomPlayerIds = playerIds;
    const snapshot = this.roomPlayersSnapshot();
    this.playersListeners.forEach((listener) => listener(snapshot));
  }

  private roomPlayersSnapshot(): RoomPlayers {
    return { myId: this.socket?.id ?? "", playerIds: this.roomPlayerIds };
  }
}

/** 앱 전체가 함께 쓰는 연결 하나. */
export const pushballConnection = new PushballConnection();
