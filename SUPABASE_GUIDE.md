# Supabase Realtime 사용 가이드

## 1. 설정 방법

### 1-1. Supabase 프로젝트 생성
1. https://supabase.com 접속
2. "Start your project" 클릭
3. 새 프로젝트 생성

### 1-2. API 키 복사
1. Supabase 대시보드에서 `Settings` > `API` 이동
2. `Project URL`과 `anon public` 키 복사

### 1-3. 환경변수 설정
`.env` 파일 생성 후 아래 내용 입력:
```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### 1-4. Realtime 활성화
1. Supabase 대시보드에서 `Database` > `Replication` 이동
2. Realtime이 활성화되어 있는지 확인
3. 또는 `Project Settings` > `API` > `Realtime` 에서 확인

## 2. 주요 기능

### 📡 Broadcast (브로드캐스트)
실시간으로 메시지를 모든 사용자에게 전송

```typescript
// 메시지 전송
channel.send({
  type: 'broadcast',
  event: 'position',
  payload: { x: 100, y: 200 }
})

// 메시지 수신
channel.on('broadcast', { event: 'position' }, ({ payload }) => {
  console.log('받은 데이터:', payload)
})
```

### 👥 Presence (접속 상태)
누가 접속했는지, 누가 나갔는지 추적

```typescript
// 내 상태 전송
await channel.track({
  playerId: 'player_123',
  online_at: new Date().toISOString()
})

// 접속 상태 감지
channel.on('presence', { event: 'join' }, ({ key }) => {
  console.log('새 플레이어:', key)
})

channel.on('presence', { event: 'leave' }, ({ key }) => {
  console.log('플레이어 퇴장:', key)
})
```

### 🗄️ Database Changes (DB 변경 감지)
데이터베이스 테이블의 변경사항을 실시간으로 감지

```typescript
supabase
  .channel('db-changes')
  .on('postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'scores' },
    (payload) => {
      console.log('새 점수 추가:', payload)
    }
  )
  .subscribe()
```

## 3. 멀티플레이어 게임 예제 사용법

### 예제 실행
`src/multiplayerExample.ts` 파일에 기본 예제가 있습니다.

main.ts를 수정하여 MultiplayerScene을 사용:

```typescript
import { MultiplayerScene } from './multiplayerExample'

const config: Phaser.Types.Core.GameConfig = {
  // ...
  scene: [MultiplayerScene], // GameScene 대신 사용
}
```

### 테스트 방법
1. 브라우저 창을 2개 열기
2. 둘 다 localhost:5173 접속
3. 한 창에서 방향키로 이동하면 다른 창에도 보임!

## 4. 현재 게임에 적용하기

### 공 위치 동기화 예제
```typescript
// GameScene에 추가

import { supabase } from './supabase'

create() {
  // ... 기존 코드

  // 채널 생성
  const channel = supabase.channel('game-room')

  // 공 위치 전송
  this.time.addEvent({
    delay: 50, // 50ms마다 전송 (20fps)
    loop: true,
    callback: () => {
      channel.send({
        type: 'broadcast',
        event: 'ball-move',
        payload: {
          x: this.myBall.x,
          y: this.myBall.y,
          vx: this.myBall.body.velocity.x,
          vy: this.myBall.body.velocity.y
        }
      })
    }
  })

  // 공 위치 수신
  channel.on('broadcast', { event: 'ball-move' }, ({ payload }) => {
    // 상대방 공 업데이트
    if (this.opponentBall) {
      this.opponentBall.x = payload.x
      this.opponentBall.y = payload.y
    }
  })

  // 구독
  channel.subscribe()
}
```

## 5. 성능 최적화 팁

### 전송 빈도 조절
```typescript
// 너무 자주 보내면 느려짐! 30-60fps 정도가 적당
if (this.time.now % 33 < 20) { // 약 30fps
  this.broadcastPosition()
}
```

### 필요한 데이터만 전송
```typescript
// ❌ 나쁜 예
channel.send({ payload: entireGameState })

// ✅ 좋은 예
channel.send({ payload: { x, y, vx, vy } })
```

### 보간(Interpolation) 사용
```typescript
// 부드러운 움직임을 위해 트윈 사용
this.tweens.add({
  targets: otherBall,
  x: receivedX,
  y: receivedY,
  duration: 50,
  ease: 'Linear'
})
```

## 6. 무료 플랜 제한사항

- 동시 접속: 200명
- 데이터 전송: 월 2GB
- Realtime 메시지: 월 200만 개

대부분의 인디 게임에는 충분합니다! 🎮

## 7. 디버깅

브라우저 콘솔에서 연결 상태 확인:
```typescript
channel.subscribe((status) => {
  console.log('Realtime 상태:', status)
  // SUBSCRIBED = 성공
  // CLOSED = 연결 끊김
  // CHANNEL_ERROR = 오류
})
```

## 8. 도움이 되는 링크

- [Supabase Realtime 공식 문서](https://supabase.com/docs/guides/realtime)
- [Broadcast 예제](https://supabase.com/docs/guides/realtime/broadcast)
- [Presence 예제](https://supabase.com/docs/guides/realtime/presence)
