import Phaser from "phaser";
import { MultiplayerScene } from "./multiplayerExample";
import { RoomListScene } from "./RoomListScene";
import { PvPGameScene } from "./PvPGameScene";

class GameScene extends Phaser.Scene {
  private balls!: Phaser.Physics.Arcade.Group;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private hole!: Phaser.Physics.Arcade.Sprite;
  private gameOver: boolean = false;
  private lastPointerX: number = 0;
  private lastPointerY: number = 0;
  private pointerVelocityX: number = 0;
  private pointerVelocityY: number = 0;

  constructor() {
    super("GameScene");
  }

  preload() {
    // 이미지나 사운드 로드
  }

  create() {
    // 안내 텍스트 추가 - 2025-11-13, 김병현 수정
    this.add
      .text(400, 30, "마우스로 공을 밀어내세요 | 구멍에 빠지지 마세요!", {
        fontSize: "20px",
        color: "#ffffff",
      })
      .setOrigin(0.5);

    // 구멍 생성 - 2025-11-13, 김병현 수정
    const holeGraphics = this.add.graphics();
    holeGraphics.fillStyle(0x000000); // 검은색
    holeGraphics.fillCircle(30, 30, 30); // 반지름 30
    holeGraphics.lineStyle(4, 0x444444); // 테두리
    holeGraphics.strokeCircle(30, 30, 30);
    holeGraphics.generateTexture("hole", 60, 60);
    holeGraphics.destroy();

    // 구멍을 바닥 중앙에 배치
    this.hole = this.physics.add.sprite(400, 550, "hole");
    this.hole.setCircle(30); // 충돌 영역을 원형으로 설정
    (this.hole.body as Phaser.Physics.Arcade.Body).setAllowGravity(false); // 중력 영향 받지 않음
    this.hole.setImmovable(true); // 움직이지 않음

    // 공 그룹 생성 (물리엔진 적용)
    this.balls = this.physics.add.group({
      bounceX: 0.9, // X축 반발력
      bounceY: 0.9, // Y축 반발력
      collideWorldBounds: true, // 화면 경계에서 충돌
    });

    // 초기 공 하나만 추가 - 2025-11-13, 김병현 수정
    this.addBall(400, 300);

    // 공과 구멍의 충돌 감지 - 2025-11-13, 김병현 수정
    this.physics.add.overlap(
      this.balls,
      this.hole,
      this.ballFallInHole,
      undefined,
      this
    );

    // 키보드 입력 설정
    this.cursors = this.input.keyboard!.createCursorKeys();

    // 마우스 움직임 추적 - 2025-11-13, 김병현 수정
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      // 마우스 속도 계산
      this.pointerVelocityX = pointer.x - this.lastPointerX;
      this.pointerVelocityY = pointer.y - this.lastPointerY;
      this.lastPointerX = pointer.x;
      this.lastPointerY = pointer.y;
    });
  }

  // 공 추가 함수 - 2025-11-13, 김병현 수정
  addBall(x: number, y: number) {
    // 3D 느낌의 원형 그래픽 생성 (그라데이션 효과)
    const graphics = this.add.graphics();
    const radius = 20;

    // 외곽선 (어두운 테두리)
    graphics.lineStyle(2, 0x000000, 0.5);
    graphics.strokeCircle(radius, radius, radius);

    // 메인 색상 (랜덤 색상)
    const mainColor = Phaser.Display.Color.RandomRGB();
    graphics.fillStyle(mainColor.color);
    graphics.fillCircle(radius, radius, radius);

    // 하이라이트 효과 (왼쪽 위에 밝은 부분)
    const highlightColor = Phaser.Display.Color.GetColor(255, 255, 255);
    graphics.fillStyle(highlightColor, 0.6);
    graphics.fillCircle(radius - 7, radius - 7, 8);

    // 그림자 효과 (오른쪽 아래에 어두운 부분)
    const shadowColor = Phaser.Display.Color.GetColor(0, 0, 0);
    graphics.fillStyle(shadowColor, 0.3);
    graphics.fillCircle(radius + 6, radius + 6, 10);

    // 텍스처로 변환
    graphics.generateTexture("ball" + Date.now(), radius * 2, radius * 2);
    graphics.destroy();

    // 물리엔진이 적용된 공 생성
    const ball = this.balls.create(x, y, "ball" + Date.now());
    ball.setCircle(radius); // 원형 충돌체 설정

    // 초기 속도 없음 (중력에 의해서만 움직임)
    ball.setVelocity(0, 0);

    // 마우스와의 상호작용 설정 - 2025-11-13, 김병현 수정
    ball.setInteractive({
      useHandCursor: false,
      pixelPerfect: true, // 정확한 원형 히트박스
    });

    // 마우스가 공 위를 지나갈 때 밀어내기
    ball.on("pointermove", () => {
      if (!this.gameOver) {
        // 마우스 속도에 비례하여 공을 밀어냄
        const pushForce = 15; // 밀어내는 힘의 배율
        ball.setVelocity(
          ball.body.velocity.x + this.pointerVelocityX * pushForce,
          ball.body.velocity.y + this.pointerVelocityY * pushForce
        );
      }
    });

    // 마우스 클릭 시 강하게 밀어내기
    ball.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (!this.gameOver) {
        // 공의 중심에서 마우스 방향의 반대로 밀어냄
        const dx = ball.x - pointer.x;
        const dy = ball.y - pointer.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 0) {
          const force = 1000; // 클릭 시 밀어내는 힘
          ball.setVelocity((dx / distance) * force, (dy / distance) * force);
        }
      }
    });
  }

  // 공이 구멍에 빠졌을 때 처리 - 2025-11-13, 김병현 수정
  ballFallInHole(ball: any) {
    if (this.gameOver) return;

    this.gameOver = true;

    // 공 제거 (사라지는 효과)
    this.tweens.add({
      targets: ball,
      scale: 0,
      alpha: 0,
      duration: 300,
      onComplete: () => {
        ball.destroy();
      },
    });

    // 게임 오버 텍스트 표시
    this.add
      .text(400, 300, "Game Over!\n공이 구멍에 빠졌습니다!", {
        fontSize: "48px",
        color: "#ff0000",
        align: "center",
      })
      .setOrigin(0.5);

    // 재시작 안내 텍스트
    this.add
      .text(400, 400, "새로고침하여 다시 시작하세요", {
        fontSize: "24px",
        color: "#ffffff",
      })
      .setOrigin(0.5);

    // 물리엔진 멈춤
    this.physics.pause();
  }

  update() {
    if (this.gameOver) return;

    // 방향키로 중력 방향 변경 - 2025-11-13, 김병현 수정
    if (this.cursors.left.isDown) {
      this.physics.world.gravity.x = -300;
    } else if (this.cursors.right.isDown) {
      this.physics.world.gravity.x = 300;
    } else {
      this.physics.world.gravity.x = 0;
    }

    if (this.cursors.up.isDown) {
      this.physics.world.gravity.y = -300;
    } else if (this.cursors.down.isDown) {
      this.physics.world.gravity.y = 300;
    }
  }
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  backgroundColor: "#2d2d2d",
  scene: [RoomListScene, PvPGameScene, GameScene], // 2025-11-14, 김병현 수정 - 방 목록이 첫 화면
  physics: {
    default: "arcade",
    arcade: {
      gravity: { x: 0, y: 0 }, // 2025-11-14, 김병현 수정 - PvP에서는 중력 없음
      debug: false,
    },
  },
  // 브라우저 크기에 맞게 자동 리사이즈 - 2025-11-14, 김병현 수정
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 800,
    height: 600,
  },
  fps: {
    target: 30, // 목표 FPS (기본값: 60)
    // min: 30, // 최소 FPS
  },
};

new Phaser.Game(config);
