import Phaser from "phaser";
// [변경: 2026-11-10 13:18, 김병현 수정] Supabase Realtime 대신 실시간 서버 연결 모듈(pushballConnection)을 쓴다.
//   방 입장은 RoomListScene 이 끝낸 상태로 넘어온다. 이 Scene 은 명단과 게임 메시지만 구독한다.
import { pushballConnection } from "./network/pushballConnection";
import type { GameMessages, RoomPlayers } from "./types/realtime";

// 2인 대전 게임 Scene - 2025-11-14, 김병현 수정
export class PvPGameScene extends Phaser.Scene {
  // [변경: 2026-11-10 13:18, 김병현 수정] 플레이어 id 는 서버가 정한다(방 명단의 myId). 직접 만들지 않는다.
  private playerId: string = "";
  private roomPlayerIds: readonly string[] = []; // 직전 방 명단. 상대가 나갔는지 판단할 때 비교한다.
  private myPosition: "bottom" | "top" = "bottom"; // 내 진영은 항상 아래
  private opponentId?: string | undefined;
  private priorityUserId?: string | undefined;

  private ball!: Phaser.Physics.Arcade.Sprite;
  private opponentBall?: Phaser.Physics.Arcade.Sprite;

  private lastPointerX: number = 0;
  private lastPointerY: number = 0;
  private pointerVelocityX: number = 0;
  private pointerVelocityY: number = 0;

  private gameOver: boolean = false;
  private waitingText?: Phaser.GameObjects.Text | undefined;

  private myHole!: Phaser.Physics.Arcade.Sprite;
  private opponentHole!: Phaser.Physics.Arcade.Sprite;
  private myScore: number = 0;
  private opponentScore: number = 0;
  private myScoreText!: Phaser.GameObjects.Text;
  private opponentScoreText!: Phaser.GameObjects.Text;
  private gameStarted: boolean = false; // 게임 시작 여부 - 2025-11-14, 김병현 수정
  private startText?: Phaser.GameObjects.Text | undefined; // 시작 안내 텍스트 - 2025-11-14, 김병현 수정
  private startButton?: Phaser.GameObjects.Container | undefined; // 시작 버튼 - 2025-11-14, 김병현 수정
  private paddle!: Phaser.Physics.Arcade.Sprite; // 내 패들 (녹색) - 2025-11-14, 김병현 수정
  private opponentPaddle?: Phaser.GameObjects.Sprite; // 상대 패들 (빨간색) - 2025-11-14, 김병현 수정
  private isMouseDown: boolean = false; // 마우스 클릭 상태 - 2025-11-14, 김병현 수정
  private mouseDownTime: number = 0; // 마우스 누른 시간 - 2025-11-14, 김병현 수정
  private fireParticles?: Phaser.GameObjects.Particles.ParticleEmitter; // 불 이펙트 파티클 - 2025-11-14, 김병현 수정

  constructor() {
    super("PvPGameScene");
  }

  // [변경: 2026-11-10 13:18, 김병현 수정] 방 id 는 연결 모듈이 기억하므로 받지 않는다. 플레이어 id 는 명단을 받을 때 채운다.
  init() {
    this.playerId = "";
    this.roomPlayerIds = [];
  }

  create() {
    // 배경색
    this.cameras.main.setBackgroundColor("#2d2d2d");

    // 화면 크기 가져오기 - 2025-11-14, 김병현 수정
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // 화면 중앙 구분선 - 2025-11-14, 김병현 수정 (상대좌표 사용)
    this.add.rectangle(width / 2, height / 2, width, 2, 0x555555);
    this.add
      .text(width / 2, height / 2, "HALF LINE", {
        fontSize: "16px",
        color: "#555555",
      })
      .setOrigin(0.5)
      .setAlpha(0.5);

    // 구멍 생성 - 2025-11-14, 김병현 수정
    this.createHoles();

    // 점수판 생성 - 2025-11-14, 김병현 수정 (상대좌표 사용)
    this.myScoreText = this.add
      .text(width * 0.875, height * 0.917, "내 점수: 0", {
        fontSize: "24px",
        color: "#00ff00",
      })
      .setOrigin(0.5);

    this.opponentScoreText = this.add
      .text(width * 0.875, height * 0.083, "상대 점수: 0", {
        fontSize: "24px",
        color: "#ff0000",
      })
      .setOrigin(0.5);

    // 대기 텍스트 - 2025-11-14, 김병현 수정 (상대좌표 사용)
    this.waitingText = this.add
      .text(width / 2, height / 3, "상대를 기다리는 중...", {
        fontSize: "32px",
        color: "#ffff00",
      })
      .setOrigin(0.5);

    // 공 생성
    this.createBall();

    // 패들(마우스 포인터) 생성 - 2025-11-14, 김병현 수정
    this.createPaddle();

    // 상대 패들 생성 - 2025-11-14, 김병현 수정
    this.createOpponentPaddle();

    // Realtime 연결
    this.setupRealtimeConnection();

    // 마우스 움직임 추적 - 2025-11-14, 김병현 수정
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      this.pointerVelocityX = pointer.x - this.lastPointerX;
      this.pointerVelocityY = pointer.y - this.lastPointerY;
      this.lastPointerX = pointer.x;
      this.lastPointerY = pointer.y;

      // 패들을 마우스 위치로 이동 (아래쪽 반에서만)
      const halfHeight = this.cameras.main.height / 2;
      if (pointer.y > halfHeight) {
        this.paddle.setPosition(pointer.x, pointer.y);

        // 패들 위치 브로드캐스트 - 2025-11-14, 김병현 수정
        if (this.opponentId && this.gameStarted) {
          this.broadcastPaddlePosition();
        }
      }
    });

    // 마우스 클릭 상태 추적 - 2025-11-14, 김병현 수정
    this.input.on("pointerdown", () => {
      this.isMouseDown = true;
      this.mouseDownTime = Date.now(); // 클릭 시작 시간 기록
    });

    this.input.on("pointerup", () => {
      this.isMouseDown = false;
      this.mouseDownTime = 0;
    });

    // 스페이스바로 게임 시작 - 2025-11-14, 김병현 수정 (혼자도 시작 가능)
    this.input.keyboard?.on("keydown-SPACE", () => {
      if (!this.gameStarted) {
        this.startGame();
      }
    });
  }

  // 시작 버튼 생성 - 2025-11-14, 김병현 수정
  private createStartButton() {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // 버튼 컨테이너 생성
    this.startButton = this.add.container(width / 2, height / 2);

    // 버튼 배경 (둥근 사각형)
    const buttonBg = this.add.rectangle(0, 0, 200, 80, 0x00ff00, 1);
    buttonBg.setStrokeStyle(4, 0xffffff);

    // 버튼 텍스트
    const buttonText = this.add
      .text(0, 0, "게임 시작", {
        fontSize: "32px",
        color: "#000000",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    // 컨테이너에 추가
    this.startButton.add([buttonBg, buttonText]);

    // 인터랙티브 설정
    buttonBg.setInteractive({ useHandCursor: true });

    // 호버 효과 - 2025-11-14, 김병현 수정
    buttonBg.on("pointerover", () => {
      buttonBg.setFillStyle(0x00dd00);
      this.startButton!.setScale(1.1);
    });

    buttonBg.on("pointerout", () => {
      buttonBg.setFillStyle(0x00ff00);
      this.startButton!.setScale(1);
    });

    // 클릭 이벤트 - 2025-11-14, 김병현 수정
    buttonBg.on("pointerdown", () => {
      if (!this.gameStarted) {
        buttonBg.setFillStyle(0x009900);
      }
    });

    buttonBg.on("pointerup", () => {
      if (!this.gameStarted) {
        this.startGame();
      }
    });

    return this.startButton;
  }

  // 패들(마우스 포인터) 생성 - 2025-11-14, 김병현 수정 (원형, 녹색)
  private createPaddle() {
    // 화면 크기 가져오기
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // 패들 그래픽 (반투명 원형) - 2025-11-14, 김병현 수정
    const paddleGraphics = this.add.graphics();
    const paddleRadius = 30;

    // 반투명 원 (녹색)
    paddleGraphics.fillStyle(0x00ff00, 0.3);
    paddleGraphics.fillCircle(paddleRadius, paddleRadius, paddleRadius);
    // 테두리
    paddleGraphics.lineStyle(3, 0x00ff00, 0.8);
    paddleGraphics.strokeCircle(paddleRadius, paddleRadius, paddleRadius);
    paddleGraphics.generateTexture(
      "paddle",
      paddleRadius * 2,
      paddleRadius * 2
    );
    paddleGraphics.destroy();

    // 패들 생성 (화면 중앙 하단) - 2025-11-14, 김병현 수정
    this.paddle = this.physics.add.sprite(width / 2, height * 0.75, "paddle");
    this.paddle.setCircle(paddleRadius); // 원형 충돌체 설정
    (this.paddle.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
    this.paddle.setImmovable(true);

    // 공과 패들 충돌 설정
    this.physics.add.collider(
      this.ball,
      this.paddle,
      this.handlePaddleCollision,
      undefined,
      this
    );
  }

  // 상대 패들 생성 - 2025-11-14, 김병현 수정 (원형, 빨간색)
  private createOpponentPaddle() {
    // 화면 크기 가져오기
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // 상대 패들 그래픽 (반투명 원형, 빨간색) - 2025-11-14, 김병현 수정
    const opponentPaddleGraphics = this.add.graphics();
    const paddleRadius = 30;

    // 반투명 원 (빨간색)
    opponentPaddleGraphics.fillStyle(0xff0000, 0.3);
    opponentPaddleGraphics.fillCircle(paddleRadius, paddleRadius, paddleRadius);
    // 테두리
    opponentPaddleGraphics.lineStyle(3, 0xff0000, 0.8);
    opponentPaddleGraphics.strokeCircle(
      paddleRadius,
      paddleRadius,
      paddleRadius
    );
    opponentPaddleGraphics.generateTexture(
      "opponent_paddle",
      paddleRadius * 2,
      paddleRadius * 2
    );
    opponentPaddleGraphics.destroy();

    // 상대 패들 생성 (화면 상단, 처음엔 숨김) - 2025-11-14, 김병현 수정
    this.opponentPaddle = this.add.sprite(
      width / 2,
      height * 0.25,
      "opponent_paddle"
    );
    this.opponentPaddle.setVisible(false); // 처음엔 보이지 않음
    this.opponentPaddle.setAlpha(0.7); // 약간 투명하게
  }

  // 패들과 공 충돌 처리 - 2025-11-14, 김병현 수정 (클릭 여부와 클릭 지속 시간에 따라 다른 힘 적용)
  private handlePaddleCollision() {
    // 공과 패들의 거리 계산
    const distance = Phaser.Math.Distance.Between(
      this.ball.x,
      this.ball.y,
      this.paddle.x,
      this.paddle.y
    );

    // 마우스 클릭 지속 시간 계산 - 2025-11-14, 김병현 수정
    const clickDuration = this.isMouseDown
      ? Date.now() - this.mouseDownTime
      : 0;

    // 거리가 60px 이하이고, 클릭했으며, 0.3 이내일 때만 강타 적용 - 2025-11-14, 김병현 수정
    if (distance <= 60 && this.isMouseDown && clickDuration < 300) {
      // 클릭 시: 강한 힘으로 튕김
      this.ball.setMaxVelocity(700); // 강타 시 최대 속도 700 - 2025-11-14, 김병현 수정
      const strongBounceForce = 3.0;
      this.ball.setVelocity(
        this.ball.body!.velocity.x * strongBounceForce,
        this.ball.body!.velocity.y * strongBounceForce
      );

      // 성공 이펙트 표시 - 2025-11-14, 김병현 수정
      this.showHitEffect(this.ball.x, this.ball.y);
    } else {
      // 평상시: 살살 튕김
      this.ball.setMaxVelocity(400); // 일반 타격 시 최대 속도 400 - 2025-11-14, 김병현 수정
      const weakBounceForce = 1.5;
      this.ball.setVelocity(
        this.ball.body!.velocity.x * weakBounceForce,
        this.ball.body!.velocity.y * weakBounceForce
      );
    }
  }

  // 클릭 성공 이펙트 - 2025-11-14, 김병현 수정
  private showHitEffect(x: number, y: number) {
    // 1. 원형 충격파 효과
    const shockwave = this.add.circle(x, y, 20, 0xffff00, 0);
    shockwave.setStrokeStyle(4, 0xffff00, 1);

    this.tweens.add({
      targets: shockwave,
      radius: 60,
      alpha: 0,
      duration: 300,
      ease: "Power2",
      onComplete: () => {
        shockwave.destroy();
      },
    });

    // 2. 파티클 효과 (여러 개의 작은 원)
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const particle = this.add.circle(x, y, 5, 0xffff00, 1);

      this.tweens.add({
        targets: particle,
        x: x + Math.cos(angle) * 40,
        y: y + Math.sin(angle) * 40,
        alpha: 0,
        scale: 0.5,
        duration: 400,
        ease: "Power2",
        onComplete: () => {
          particle.destroy();
        },
      });
    }

    // 3. 패들 플래시 효과
    this.paddle.setTint(0xffff00);
    this.time.delayedCall(100, () => {
      this.paddle.clearTint();
    });
  }

  // 구멍 생성 - 2025-11-14, 김병현 수정 (상대좌표 사용)
  private createHoles() {
    // 화면 크기 가져오기
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // 구멍 그래픽
    const holeGraphics = this.add.graphics();
    const holeRadius = 50;

    // 검은색 원
    holeGraphics.fillStyle(0x000000);
    holeGraphics.fillCircle(holeRadius, holeRadius, holeRadius);
    // 테두리
    holeGraphics.lineStyle(4, 0x666666);
    holeGraphics.strokeCircle(holeRadius, holeRadius, holeRadius);
    holeGraphics.generateTexture("goal_hole", holeRadius * 2, holeRadius * 2);
    holeGraphics.destroy();

    // 내 골대 (아래쪽) - 화면 중앙, 하단에서 5%
    this.myHole = this.physics.add.sprite(
      width / 2,
      height * 0.95,
      "goal_hole"
    );
    this.myHole.setCircle(holeRadius);
    (this.myHole.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
    this.myHole.setImmovable(true);

    // 상대 골대 (위쪽) - 화면 중앙, 상단에서 5%
    this.opponentHole = this.physics.add.sprite(
      width / 2,
      height * 0.05,
      "goal_hole"
    );
    this.opponentHole.setCircle(holeRadius);
    (this.opponentHole.body as Phaser.Physics.Arcade.Body).setAllowGravity(
      false
    );
    this.opponentHole.setImmovable(true);

    // 골대 라벨
    this.add
      .text(width / 2, height * 0.95, "GOAL", {
        fontSize: "20px",
        color: "#ff0000",
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height * 0.05, "GOAL", {
        fontSize: "20px",
        color: "#00ff00",
      })
      .setOrigin(0.5);
  }

  // 공 생성 - 2025-11-14, 김병현 수정 (상대좌표 사용)
  private createBall() {
    // 화면 크기 가져오기
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // 공 그래픽
    const graphics = this.add.graphics();
    const radius = 20;

    graphics.fillStyle(0xff6b6b);
    graphics.fillCircle(radius, radius, radius);
    graphics.lineStyle(2, 0xffffff, 0.8);
    graphics.strokeCircle(radius, radius, radius);
    graphics.generateTexture("game_ball", radius * 2, radius * 2);
    graphics.destroy();

    // 공 생성 (화면 중앙) - 2025-11-14, 김병현 수정
    this.ball = this.physics.add.sprite(width / 2, height / 2, "game_ball");
    this.ball.setCircle(radius);
    this.ball.setBounce(0.9);
    this.ball.setCollideWorldBounds(true);
    this.ball.setMaxVelocity(400); // 기본 최대 속도 제한 (픽셀/초) - 2025-11-14, 김병현 수정
    // Drag 제거 - 공이 멈추지 않고 계속 굴러감
    // 처음엔 공이 정지 상태
    this.ball.setVelocity(0, 0);

    // 이제 패들(원형 마우스 포인터)로 공을 제어합니다 - 2025-11-14, 김병현 수정

    // 불 이펙트 파티클 생성 - 2025-11-14, 김병현 수정
    this.createFireEffect();

    // 공과 골대 충돌 감지 - 2025-11-14, 김병현 수정
    this.physics.add.overlap(
      this.ball,
      this.opponentHole,
      this.handleGoalScored.bind(this, "me"),
      undefined,
      this
    );

    this.physics.add.overlap(
      this.ball,
      this.myHole,
      this.handleGoalScored.bind(this, "opponent"),
      undefined,
      this
    );
  }

  // 불 이펙트 생성 - 2025-11-14, 김병현 수정
  private createFireEffect() {
    // 불 파티클용 텍스처 생성 (오렌지/빨강/노랑)
    const fireGraphics = this.add.graphics();

    // 빨간색 파티클
    fireGraphics.fillStyle(0xff4500, 1);
    fireGraphics.fillCircle(4, 4, 4);
    fireGraphics.generateTexture("fire_particle_red", 8, 8);
    fireGraphics.clear();

    // 오렌지색 파티클
    fireGraphics.fillStyle(0xff8c00, 1);
    fireGraphics.fillCircle(4, 4, 4);
    fireGraphics.generateTexture("fire_particle_orange", 8, 8);
    fireGraphics.clear();

    // 노란색 파티클
    fireGraphics.fillStyle(0xffd700, 1);
    fireGraphics.fillCircle(4, 4, 4);
    fireGraphics.generateTexture("fire_particle_yellow", 8, 8);
    fireGraphics.destroy();

    // 파티클 시스템 생성
    this.fireParticles = this.add.particles(0, 0, "fire_particle_red", {
      speed: { min: 50, max: 150 },
      scale: { start: 1, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 300,
      blendMode: "ADD",
      frequency: 20,
      emitting: false, // 처음엔 꺼짐
      tint: [0xff4500, 0xff8c00, 0xffd700], // 빨강, 오렌지, 노랑 색상 랜덤
    });

    // 공의 뒤쪽에서 파티클이 나오도록 설정
    this.fireParticles.startFollow(this.ball);
  }

  // 게임 시작 - 2025-11-14, 김병현 수정
  private startGame() {
    this.gameStarted = true;

    // 시작 텍스트 제거
    if (this.startText) {
      this.startText.destroy();
      this.startText = undefined;
    }

    // 시작 버튼 제거 - 2025-11-14, 김병현 수정
    if (this.startButton) {
      this.startButton.destroy();
      this.startButton = undefined;
    }

    // 공에 초기 속도 부여 (위 또는 아래로 향하도록) - 2025-11-14, 김병현 수정
    const direction = Phaser.Math.Between(0, 1) === 0 ? -1 : 1; // -1: 위(상대), 1: 아래(나)
    this.ball.setVelocity(
      Phaser.Math.Between(-150, 150), // X축은 약간의 랜덤
      direction * Phaser.Math.Between(150, 200) // Y축은 확실히 위 또는 아래로
    );

    // 게임 시작 브로드캐스트
    // [변경: 2026-11-10 13:18, 김병현 수정] 서버를 거쳐 상대에게만 보낸다.
    pushballConnection.sendEvent("game-start", {});
  }

  // 득점 처리 - 2025-11-14, 김병현 수정
  private handleGoalScored(scorer: "me" | "opponent") {
    if (this.gameOver) return;

    // 득점자 업데이트
    if (scorer === "me") {
      this.myScore++;
      this.myScoreText.setText(`내 점수: ${this.myScore}`);
    } else {
      this.opponentScore++;
      this.opponentScoreText.setText(`상대 점수: ${this.opponentScore}`);
    }

    // 득점 브로드캐스트
    // [변경: 2026-11-10 13:18, 김병현 수정] 서버를 거쳐 상대에게만 보낸다.
    pushballConnection.sendEvent("goal-scored", {
      scorer: scorer,
      myScore: this.myScore,
      opponentScore: this.opponentScore,
    });

    // 득점 효과
    this.cameras.main.flash(300, 255, 255, 255);

    // 3점 먼저 득점하면 승리
    if (this.myScore >= 3) {
      this.handleGameOver(true);
    } else if (this.opponentScore >= 3) {
      this.handleGameOver(false);
    } else {
      // 공 리셋
      this.resetBall();
    }
  }

  // 공 리셋 - 2025-11-14, 김병현 수정 (상대좌표 사용, 위 또는 아래로 향하도록)
  private resetBall() {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    this.ball.setPosition(width / 2, height / 2);

    // 공이 위 또는 아래로 향하도록 - 2025-11-14, 김병현 수정
    const direction = Phaser.Math.Between(0, 1) === 0 ? -1 : 1; // -1: 위(상대), 1: 아래(나)
    this.ball.setVelocity(
      Phaser.Math.Between(-150, 150), // X축은 약간의 랜덤
      direction * Phaser.Math.Between(150, 200) // Y축은 확실히 위 또는 아래로
    );
  }

  // 게임 초기화 - 2025-11-14, 김병현 수정 (새로운 상대가 들어왔을 때)
  private resetGame() {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // 게임 상태 초기화
    this.gameStarted = false;
    this.gameOver = false;
    this.myScore = 0;
    this.opponentScore = 0;

    // 점수판 초기화
    this.myScoreText.setText("내 점수: 0");
    this.opponentScoreText.setText("상대 점수: 0");

    // 공 위치 및 속도 초기화
    this.ball.setPosition(width / 2, height / 2);
    this.ball.setVelocity(0, 0);
    this.ball.setMaxVelocity(400);

    // 물리 엔진 재개
    this.physics.resume();

    // 시작 버튼 표시 - 2025-11-14, 김병현 수정
    if (this.startButton) {
      this.startButton.destroy();
    }
    this.createStartButton();
  }

  // Realtime 연결 설정 - 2025-11-14, 김병현 수정
  // [변경: 2026-11-10 13:18, 김병현 수정] Supabase 채널 대신 연결 모듈의 명단 구독과 게임 메시지 구독을 쓴다.
  //   Phaser 는 씬의 shutdown() 메서드를 부르지 않으므로, shutdown 이벤트에서 구독을 풀고 방에서 나간다.
  private setupRealtimeConnection() {
    const unsubscribers = [
      pushballConnection.onPlayersChanged((players) =>
        this.handleRoomPlayersChanged(players)
      ),
      pushballConnection.onRelay("ball-position", (payload) =>
        this.applyOpponentBallPosition(payload)
      ),
      pushballConnection.onRelay("game-start", () => {
        if (!this.gameStarted) {
          this.startGame();
        }
      }),
      pushballConnection.onRelay("paddle-position", (payload) =>
        this.applyOpponentPaddlePosition(payload)
      ),
      pushballConnection.onRelay("goal-scored", (payload) =>
        this.applyOpponentGoal(payload)
      ),
      pushballConnection.onRelay("game-over", (payload) => {
        if (payload.loserId === this.playerId) {
          this.handleGameOver(false);
        } else {
          this.handleGameOver(true);
        }
      }),
    ];

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      pushballConnection.exitRoom();
    });
  }

  // 방 명단 변경 처리 - 2025-11-14, 김병현 수정
  // [변경: 2026-11-10 13:18, 김병현 수정] Supabase Presence 의 sync 와 leave 를 서버 방 명단 하나로 대신한다.
  private handleRoomPlayersChanged({ myId, playerIds }: RoomPlayers) {
    const previousPlayerIds = this.roomPlayerIds;
    this.roomPlayerIds = playerIds;
    this.playerId = myId;

    if (playerIds.length === 2) {
      // 2명이면 게임 초기화 - 2025-11-14, 김병현 수정
      if (this.waitingText) {
        this.waitingText.destroy();
        this.waitingText = undefined;
      }

      // 상대 ID 저장
      const newOpponentId = playerIds.find((id) => id !== this.playerId);

      // 새로운 상대가 들어왔을 때 게임 초기화 - 2025-11-14, 김병현 수정
      if (newOpponentId !== this.opponentId) {
        this.opponentId = newOpponentId;

        // 게임이 진행 중이었다면 초기화
        if (this.gameStarted) {
          this.resetGame();
        }
      }

      // 시작 버튼 표시 - 2025-11-14, 김병현 수정
      if (!this.startButton && !this.gameStarted) {
        this.createStartButton();
      }
    } else if (playerIds.length === 1) {
      if (!this.waitingText && !this.gameStarted) {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;
        this.waitingText = this.add
          .text(
            width / 2,
            height / 3,
            "혼자 플레이 중 | 상대를 기다리는 중...",
            {
              fontSize: "24px",
              color: "#ffff00",
            }
          )
          .setOrigin(0.5);
      }

      this.priorityUserId = playerIds[0];
    }

    // 상대가 나갔을 때 안내 (기존 Presence leave 이벤트 대응)
    const opponentLeft =
      this.opponentId !== undefined &&
      previousPlayerIds.includes(this.opponentId) &&
      !playerIds.includes(this.opponentId);
    if (opponentLeft && !this.gameOver) {
      const width = this.cameras.main.width;
      const height = this.cameras.main.height;
      this.add
        .text(width / 2, height / 2, "상대가 나갔습니다!", {
          fontSize: "48px",
          color: "#ff0000",
        })
        .setOrigin(0.5);
    }
  }

  // 공 위치 동기화 수신 - 2025-11-14, 김병현 수정 (상대좌표 사용, 보간 적용)
  // [변경: 2026-11-10 13:18, 김병현 수정] 서버가 내 메시지를 돌려보내지 않으므로 보낸 사람 확인을 뺐다.
  private applyOpponentBallPosition(payload: GameMessages["ball-position"]) {
    if (!this.ball) return;

    // 화면 크기 가져오기
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // 상대 좌표(0~1)를 절대 좌표로 변환
    const absoluteX = payload.relativeX * width;
    const absoluteY = payload.relativeY * height;

    // 상대방의 공 위치 업데이트 (화면을 180도 회전하여 표시)
    // 상대는 위쪽에 있으므로 좌표를 반전
    const flippedY = height - absoluteY;
    const flippedX = width - absoluteX;

    // 현재 위치와 목표 위치의 차이 계산
    const distanceX = flippedX - this.ball.x;
    const distanceY = flippedY - this.ball.y;
    const distance = Math.sqrt(distanceX * distanceX + distanceY * distanceY);

    // 거리가 너무 크면 순간이동 (제어권 전환 시), 작으면 부드럽게 보간
    if (distance > 100) {
      // 제어권 전환 시: 즉시 이동
      this.ball.setPosition(flippedX, flippedY);
      this.ball.setVelocity(-payload.vx, -payload.vy);
    } else {
      // 일반적인 경우: 부드럽게 보간
      const lerpFactor = 0.3; // 보간 강도 (0~1, 높을수록 빠르게 따라감)
      const targetX = this.ball.x + distanceX * lerpFactor;
      const targetY = this.ball.y + distanceY * lerpFactor;

      this.ball.setPosition(targetX, targetY);
      this.ball.setVelocity(-payload.vx, -payload.vy);
    }
  }

  // 패들 위치 동기화 수신 - 2025-11-14, 김병현 수정 (상대좌표 사용)
  // [변경: 2026-11-10 13:18, 김병현 수정] 서버가 내 메시지를 돌려보내지 않으므로 보낸 사람 확인을 뺐다.
  private applyOpponentPaddlePosition(
    payload: GameMessages["paddle-position"]
  ) {
    if (!this.opponentPaddle) return;

    // 화면 크기 가져오기
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // 상대 좌표(0~1)를 절대 좌표로 변환
    const absoluteX = payload.relativeX * width;
    const absoluteY = payload.relativeY * height;

    // 상대방의 패들 위치 업데이트 (화면을 180도 회전하여 표시)
    const flippedY = height - absoluteY;
    const flippedX = width - absoluteX;

    this.opponentPaddle.setPosition(flippedX, flippedY);
    this.opponentPaddle.setVisible(true); // 상대가 연결되면 보이게
  }

  // 득점 이벤트 수신 - 2025-11-14, 김병현 수정
  private applyOpponentGoal(payload: GameMessages["goal-scored"]) {
    // 상대방 화면에서는 scorer가 반대로 표시됨
    if (payload.scorer === "me") {
      this.opponentScore++;
      this.opponentScoreText.setText(`상대 점수: ${this.opponentScore}`);
    } else {
      this.myScore++;
      this.myScoreText.setText(`내 점수: ${this.myScore}`);
    }

    // 득점 효과
    this.cameras.main.flash(300, 255, 255, 255);

    // 승리 조건 확인
    if (this.myScore >= 3) {
      this.handleGameOver(true);
    } else if (this.opponentScore >= 3) {
      this.handleGameOver(false);
    }
  }

  // 공 위치 브로드캐스트 - 2025-11-14, 김병현 수정 (상대좌표 사용)
  // [변경: 2026-11-10 13:18, 김병현 수정] 매 프레임 불러도 연결 모듈이 30Hz 로 줄여 최신 값만 보낸다.
  private broadcastBallPosition() {
    // 화면 크기 가져오기
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // 절대 좌표를 비율로 변환 (0~1)
    const relativeX = this.ball.x / width;
    const relativeY = this.ball.y / height;

    pushballConnection.syncState("ball-position", {
      relativeX: relativeX,
      relativeY: relativeY,
      vx: this.ball.body!.velocity.x,
      vy: this.ball.body!.velocity.y,
    });
  }

  // 패들 위치 브로드캐스트 - 2025-11-14, 김병현 수정 (상대좌표 사용)
  // [변경: 2026-11-10 13:18, 김병현 수정] 마우스가 움직일 때마다 불러도 연결 모듈이 30Hz 로 줄여 최신 값만 보낸다.
  private broadcastPaddlePosition() {
    // 화면 크기 가져오기
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // 절대 좌표를 비율로 변환 (0~1)
    const relativeX = this.paddle.x / width;
    const relativeY = this.paddle.y / height;

    pushballConnection.syncState("paddle-position", {
      relativeX: relativeX,
      relativeY: relativeY,
    });
  }

  // 게임 오버 처리 - 2025-11-14, 김병현 수정 (상대좌표 사용)
  private handleGameOver(isWin: boolean) {
    if (this.gameOver) return;
    this.gameOver = true;

    this.physics.pause();

    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    this.add
      .text(width / 2, height / 2, isWin ? "승리!" : "패배!", {
        fontSize: "64px",
        color: isWin ? "#00ff00" : "#ff0000",
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height * 0.667, "3초 후 방 목록으로 돌아갑니다", {
        fontSize: "24px",
        color: "#ffffff",
      })
      .setOrigin(0.5);

    this.time.delayedCall(3000, () => {
      this.scene.start("RoomListScene");
    });
  }

  update() {
    if (this.gameOver || !this.ball) return;

    // 공의 속도 계산 - 2025-11-14, 김병현 수정
    const velocity = Math.sqrt(
      this.ball.body!.velocity.x ** 2 + this.ball.body!.velocity.y ** 2
    );

    // 속도가 700 이상이면 불 이펙트 활성화 - 2025-11-14, 김병현 수정
    if (this.fireParticles) {
      if (velocity >= 500) {
        this.fireParticles.start();
      } else {
        this.fireParticles.stop();
      }
    }

    // 게임이 시작된 후에만 브로드캐스트 - 2025-11-14, 김병현 수정
    // 공이 내 영역(아래쪽 절반, y > halfHeight)에 있을 때만 내가 제어권을 가짐
    if (this.opponentId && this.gameStarted) {
      const halfHeight = this.cameras.main.height / 2;
      // 공이 내 영역에 있을 때만 브로드캐스트
      if (this.ball.y > halfHeight) {
        this.broadcastBallPosition();
      }
    }
  }
  // [변경: 2026-11-10 13:18, 김병현 수정] shutdown() 메서드를 지웠다. Phaser 가 부르지 않아서 채널이 정리되지 않았다.
  //   정리는 setupRealtimeConnection 의 shutdown 이벤트 핸들러가 한다.
}
