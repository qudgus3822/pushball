import Phaser from "phaser";
import { supabase } from "./supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

// 방 목록 Scene - 2025-11-14, 김병현 수정
export class RoomListScene extends Phaser.Scene {
  private availableRooms: Map<string, { playerCount: number }> = new Map();
  private roomButtons: Phaser.GameObjects.Text[] = [];
  private lobbyChannel!: RealtimeChannel;
  private statusText!: Phaser.GameObjects.Text;

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

    // 로비 채널 연결 (모든 플레이어가 같은 로비에 접속)
    this.connectToLobby();

    // 3개의 방 버튼 생성
    this.createRoomButtons();
  }

  // 로비 채널 연결 - 2025-11-14, 김병현 수정
  private connectToLobby() {
    this.lobbyChannel = supabase.channel("game-lobby", {
      config: {
        presence: { key: "player_" + Date.now() },
      },
    });

    // Presence로 각 방의 인원 추적
    this.lobbyChannel
      .on("presence", { event: "sync" }, () => {
        this.updateRoomList();
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          this.statusText.setText("연결 완료! 방을 선택하세요");
        }
      });
  }

  // 방 목록 업데이트 - 2025-11-14, 김병현 수정
  private updateRoomList() {
    const state = this.lobbyChannel.presenceState();

    // 각 방의 인원수 계산
    this.availableRooms.clear();
    Object.values(state).forEach((presences: any) => {
      presences.forEach((presence: any) => {
        const roomId = presence.roomId;
        if (roomId) {
          const current = this.availableRooms.get(roomId) || { playerCount: 0 };
          current.playerCount++;
          this.availableRooms.set(roomId, current);
        }
      });
    });

    // 버튼 업데이트
    this.roomButtons.forEach((button, index) => {
      const roomId = `room-${index + 1}`;
      const roomData = this.availableRooms.get(roomId);
      const playerCount = roomData?.playerCount || 0;

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

    for (let i = 0; i < 3; i++) {
      const roomId = `room-${i + 1}`;
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
  private async joinRoom(roomId: string) {
    const roomData = this.availableRooms.get(roomId);
    const playerCount = roomData?.playerCount || 0;

    if (playerCount >= 2) {
      this.statusText.setText("방이 가득 찼습니다!");
      this.statusText.setColor("#ff0000");
      return;
    }

    // 로비에서 방 정보 업데이트
    await this.lobbyChannel.track({
      roomId: roomId,
      online_at: new Date().toISOString(),
    });

    this.statusText.setText(`${roomId} 입장 중...`);
    this.statusText.setColor("#00ff00");

    // 게임 Scene으로 전환
    this.scene.start("PvPGameScene", { roomId });
  }

  shutdown() {
    if (this.lobbyChannel) {
      this.lobbyChannel.unsubscribe();
    }
  }
}
