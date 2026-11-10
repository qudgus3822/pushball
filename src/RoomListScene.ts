import Phaser from "phaser";
// [변경: 2026-11-10 13:18, 김병현 수정] Supabase Realtime 대신 실시간 서버 연결 모듈(pushballConnection)을 쓴다.
import { pushballConnection } from "./network/pushballConnection";
import type { LobbyRoomCounts, LobbySnapshot, PushballRoomId } from "./types/realtime";

/** 로비에 보여 줄 방. 서버에 고정된 방 id 와 같다. */
const ROOM_IDS: readonly PushballRoomId[] = ["room-1", "room-2", "room-3"];

// 방 목록 Scene - 2025-11-14, 김병현 수정
export class RoomListScene extends Phaser.Scene {
  // [변경: 2026-11-10 13:18, 김병현 수정] 방 인원은 서버가 보내 준 값을 그대로 쓴다(Presence 집계 제거).
  private roomCounts?: LobbyRoomCounts | undefined;
  private roomButtons: Phaser.GameObjects.Text[] = [];
  private statusText!: Phaser.GameObjects.Text;
  private lobbyConnected: boolean = false; // 연결 완료 문구를 연결될 때 한 번만 띄우기 위함
  private isEntering: boolean = false; // 입장 요청 중 중복 클릭 방지

  constructor() {
    super("RoomListScene");
  }

  create() {
    // 배경색
    this.cameras.main.setBackgroundColor("#1a1a2e");

    // 제목
    this.add
      .text(400, 50, "공 튀기기 대전", {
        fontSize: "48px",
        color: "#ffffff",
      })
      .setOrigin(0.5);

    // 안내 텍스트
    this.add
      .text(400, 120, "방을 선택하거나 새로운 방을 만드세요", {
        fontSize: "20px",
        color: "#aaaaaa",
      })
      .setOrigin(0.5);

    // 상태 텍스트
    this.statusText = this.add
      .text(400, 160, "방 목록 로딩 중...", {
        fontSize: "16px",
        color: "#00ff00",
      })
      .setOrigin(0.5);

    // 방 목록 영역 배경
    const roomListBg = this.add.rectangle(400, 350, 600, 300, 0x16213e);
    roomListBg.setStrokeStyle(2, 0x0f3460);

    // 3개의 방 버튼 생성
    this.createRoomButtons();

    // [변경: 2026-11-10 13:18, 김병현 수정] 로비 구독은 버튼을 만든 뒤에 한다(구독하자마자 현재 상태로 버튼을 갱신하기 때문).
    this.connectToLobby();
  }

  // 로비 구독 - 2025-11-14, 김병현 수정
  // [변경: 2026-11-10 13:18, 김병현 수정] Supabase 로비 채널 대신 서버의 로비 구독을 쓴다.
  private connectToLobby() {
    this.lobbyConnected = false;
    const stopWatchingLobby = pushballConnection.watchLobby((lobby) =>
      this.updateRoomList(lobby)
    );
    // Phaser 는 씬의 shutdown() 메서드를 부르지 않는다. shutdown 이벤트에서 구독을 끝낸다.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, stopWatchingLobby);
  }

  // 방 목록 업데이트 - 2025-11-14, 김병현 수정
  // [변경: 2026-11-10 13:18, 김병현 수정] Presence 집계 대신 서버가 보낸 방별 인원으로 버튼을 갱신한다.
  private updateRoomList(lobby: LobbySnapshot) {
    if (!lobby.connected) {
      this.lobbyConnected = false;
      this.statusText.setText("서버에 연결하는 중...");
      this.statusText.setColor("#ffff00");
      return;
    }

    if (!this.lobbyConnected) {
      this.lobbyConnected = true;
      this.statusText.setText("연결 완료! 방을 선택하세요");
      this.statusText.setColor("#00ff00");
    }
    this.roomCounts = lobby.rooms;

    // 버튼 업데이트
    this.roomButtons.forEach((button, index) => {
      const roomId = ROOM_IDS[index];
      const playerCount = roomId ? lobby.rooms[roomId] : 0;

      if (playerCount === 0) {
        button.setText(`방 ${index + 1} - 비어있음`);
        button.setColor("#00ff00");
      } else if (playerCount === 1) {
        button.setText(`방 ${index + 1} - 대기 중 (1/2)`);
        button.setColor("#ffff00");
      } else {
        button.setText(`방 ${index + 1} - 게임 중 (2/2)`);
        button.setColor("#ff0000");
      }
    });
  }

  // 방 버튼 생성 - 2025-11-14, 김병현 수정
  private createRoomButtons() {
    const startY = 250;
    const spacing = 80;

    // [변경: 2026-11-10 13:18, 김병현 수정] 방 id 를 서버의 고정 목록(ROOM_IDS)에서 가져온다.
    for (const [i, roomId] of ROOM_IDS.entries()) {
      const y = startY + i * spacing;

      // 방 배경
      const bg = this.add.rectangle(400, y, 500, 60, 0x0f3460);
      bg.setStrokeStyle(2, 0x533483);
      bg.setInteractive({ useHandCursor: true });

      // 방 텍스트
      const text = this.add
        .text(400, y, `방 ${i + 1} - 로딩 중...`, {
          fontSize: "24px",
          color: "#ffffff",
        })
        .setOrigin(0.5);

      this.roomButtons.push(text);

      // 호버 효과
      bg.on("pointerover", () => {
        bg.setFillStyle(0x533483);
      });

      bg.on("pointerout", () => {
        bg.setFillStyle(0x0f3460);
      });

      // 클릭 이벤트
      bg.on("pointerdown", () => {
        this.joinRoom(roomId);
      });
    }
  }

  // 방 입장 - 2025-11-14, 김병현 수정
  // [변경: 2026-11-10 13:18, 김병현 수정] 서버에 입장을 요청하고, 서버가 받아 준 뒤에 게임 Scene 으로 넘어간다.
  //   정원은 서버가 최종 판정한다(두 사람이 동시에 마지막 자리를 눌러도 한 명만 들어감).
  private async joinRoom(roomId: PushballRoomId) {
    if (this.isEntering) return;

    const playerCount = this.roomCounts?.[roomId] ?? 0;
    if (playerCount >= 2) {
      this.statusText.setText("방이 가득 찼습니다!");
      this.statusText.setColor("#ff0000");
      return;
    }

    this.isEntering = true;
    this.statusText.setText(`${roomId} 입장 중...`);
    this.statusText.setColor("#00ff00");

    const outcome = await pushballConnection.enterRoom(roomId);
    this.isEntering = false;

    if (outcome === "entered") {
      // 게임 Scene으로 전환
      this.scene.start("PvPGameScene");
    } else if (outcome === "room-full") {
      this.statusText.setText("방이 가득 찼습니다!");
      this.statusText.setColor("#ff0000");
    } else {
      this.statusText.setText("서버에 연결할 수 없습니다. 잠시 후 다시 시도하세요");
      this.statusText.setColor("#ff0000");
    }
  }
}
