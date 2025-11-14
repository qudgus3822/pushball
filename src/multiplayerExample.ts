import Phaser from "phaser";
import { supabase } from "./supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

// 멀티플레이어 게임 예제 - 2025-11-14, 김병현 수정
export class MultiplayerScene extends Phaser.Scene {
  private channel!: RealtimeChannel;
  private roomId: string = "game-room-1"; // 방 ID
  private playerId!: string;
  private myBall!: Phaser.Physics.Arcade.Sprite;
  private otherPlayers: Map<string, Phaser.Physics.Arcade.Sprite> = new Map();

  constructor() {
    super("MultiplayerScene");
  }

  create() {
    // 고유 플레이어 ID 생성
    this.playerId = "player_" + Math.random().toString(36).substr(2, 9);

    // 안내 텍스트
    this.add
      .text(400, 30, "멀티플레이어 모드 | 방향키로 이동", {
        fontSize: "20px",
        color: "#ffffff",
      })
      .setOrigin(0.5);

    // 내 공 생성
    this.myBall = this.physics.add.sprite(400, 300, "");
    this.createBallGraphic(this.myBall, 0x00ff00); // 초록색
    this.myBall.setCollideWorldBounds(true);
    this.myBall.setBounce(0.5);

    // Supabase Realtime 채널 연결
    this.setupRealtimeConnection();

    // 키보드 입력
    const cursors = this.input.keyboard!.createCursorKeys();

    // 업데이트 루프에서 사용할 변수
    this.events.on("update", () => {
      if (!this.myBall) return;

      // 방향키로 공 이동
      const speed = 300;
      if (cursors.left.isDown) {
        this.myBall.setVelocityX(-speed);
      } else if (cursors.right.isDown) {
        this.myBall.setVelocityX(speed);
      } else {
        this.myBall.setVelocityX(0);
      }

      if (cursors.up.isDown) {
        this.myBall.setVelocityY(-speed);
      } else if (cursors.down.isDown) {
        this.myBall.setVelocityY(speed);
      } else {
        this.myBall.setVelocityY(0);
      }

      // 내 위치를 다른 플레이어에게 전송 (30fps로 제한)
      if (this.time.now % 33 < 20) {
        this.broadcastPosition();
      }
    });
  }

  // 공 그래픽 생성 - 2025-11-14, 김병현 수정
  private createBallGraphic(ball: Phaser.Physics.Arcade.Sprite, color: number) {
    const graphics = this.add.graphics();
    const radius = 20;

    graphics.fillStyle(color);
    graphics.fillCircle(radius, radius, radius);
    graphics.lineStyle(2, 0xffffff, 0.8);
    graphics.strokeCircle(radius, radius, radius);

    graphics.generateTexture(
      "ball_" + color.toString(16),
      radius * 2,
      radius * 2
    );
    graphics.destroy();

    ball.setTexture("ball_" + color.toString(16));
    ball.setCircle(radius);
  }

  // Supabase Realtime 연결 설정 - 2025-11-14, 김병현 수정
  private setupRealtimeConnection() {
    // 채널 생성 및 참가
    this.channel = supabase.channel(this.roomId, {
      config: {
        broadcast: { self: false }, // 자신에게는 브로드캐스트하지 않음
        presence: { key: this.playerId },
      },
    });

    // 1. Presence: 플레이어 입장/퇴장 감지
    this.channel
      .on("presence", { event: "sync" }, () => {
        const state = this.channel.presenceState();
        console.log("현재 접속 중인 플레이어:", state);

        // 현재 있는 모든 플레이어 확인
        Object.keys(state).forEach((playerId) => {
          if (playerId !== this.playerId && !this.otherPlayers.has(playerId)) {
            // 새로운 플레이어 생성
            const otherBall = this.physics.add.sprite(400, 300, "");
            this.createBallGraphic(otherBall, 0xff0000); // 빨간색
            this.otherPlayers.set(playerId, otherBall);
            console.log("새 플레이어 입장:", playerId);
          }
        });

        // 나간 플레이어 제거
        this.otherPlayers.forEach((ball, playerId) => {
          if (!state[playerId]) {
            ball.destroy();
            this.otherPlayers.delete(playerId);
            console.log("플레이어 퇴장:", playerId);
          }
        });
      })
      .on("presence", { event: "join" }, ({ key, newPresences }) => {
        console.log("플레이어 입장:", key, newPresences);
      })
      .on("presence", { event: "leave" }, ({ key, leftPresences }) => {
        console.log("플레이어 퇴장:", key, leftPresences);
      });

    // 2. Broadcast: 실시간 위치 업데이트 수신
    this.channel.on(
      "broadcast",
      { event: "position" },
      ({ payload }: { payload: any }) => {
        const { playerId, x, y } = payload;

        // 다른 플레이어의 위치 업데이트
        const otherBall = this.otherPlayers.get(playerId);
        if (otherBall) {
          // 부드러운 이동을 위한 트윈
          this.tweens.add({
            targets: otherBall,
            x: x,
            y: y,
            duration: 50,
            ease: "Linear",
          });
        }
      }
    );

    // 채널 구독
    this.channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        console.log("✅ Realtime 연결 성공!");
        // Presence 상태 전송
        await this.channel.track({
          playerId: this.playerId,
          online_at: new Date().toISOString(),
        });
      }
    });
  }

  // 내 위치를 브로드캐스트 - 2025-11-14, 김병현 수정
  private broadcastPosition() {
    if (!this.myBall) return;

    this.channel.send({
      type: "broadcast",
      event: "position",
      payload: {
        playerId: this.playerId,
        x: this.myBall.x,
        y: this.myBall.y,
      },
    });
  }

  // Scene 종료 시 정리 - 2025-11-14, 김병현 수정
  shutdown() {
    if (this.channel) {
      this.channel.unsubscribe();
    }
  }
}
