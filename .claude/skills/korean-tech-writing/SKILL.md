---
name: korean-tech-writing
description: "The 10 rules for Korean technical prose — keep English technical terms in English, one name per concept, one clause per sentence, plain declarative '-다' endings, Korean punctuation. Apply whenever you write or review ANY Korean text: repo docs, README, design docs, flow-analysis docs, plans, reviews, commit messages, session files, chat answers, or code comments, and when translating English documentation into Korean. Trigger in PLANNING, IMPLEMENTATION, and REVIEW — every phase that produces Korean prose. Also trigger when the user writes to you in Korean and expects a Korean document back. English-only output does not need it. When in doubt, trigger."
---

# Korean Tech Writing

영어 원문을 그대로 옮겨 적으면 읽는 사람이 뜻을 못 잡는다. 용어가 한자어로 바뀌고,
한 문장에 절이 세 개씩 붙고, 문체가 뒤섞이기 때문이다. 아래 10가지 규칙을 지키면
그런 문서를 내보내지 않는다.

적용 대상: 저장소 문서, README, 설계 문서, flow-analysis 문서, plan, review,
commit message, session 파일. 한국어로 내보내는 모든 산출물이다.

## 한국어 기술 문서 작성 규칙

1. 영어 기술 용어는 그대로 쓴다. purge, tombstone, job, roster, reconcile,
   flag, index 등은 번역하지 말 것. 한자어로 바꾸지 말 것
   (소각/묘비 행/잡/명부 ✗).
2. 번역 경계를 일관되게. 한 문서 안에서 어떤 용어는 번역하고 어떤 건
   영어로 두는 혼용 금지.
3. 한 지시 대상에는 한 이름만. 저장소/코드베이스, 삭제/소각/제거를
   섞어 쓰지 말 것.
4. 은유는 옮기지 말고 메커니즘을 서술한다.
   "시계가 사람 손가락" ✗ → "사람이 직접 실행해야만 도는 구조" ○
5. 무생물 주어가 능동 동사를 취하지 않게 한다. 행위자를 사람으로 두거나
   절을 재구성할 것.
6. 한 문장에 한 절. 영어 원문의 종속절 사슬을 그대로 이어 붙이지 말 것.
7. 문체를 통일한다: 평서 '-다'로 끝내고, 명사형 종결(-됨, -안 꺼짐)과
   섞지 말 것. 구어(진짜, 덤, 돌리다)와 한자어(총체적, 결정론적)를
   나란히 두지 말 것.
8. 문장부호는 한국어 관습대로. em dash 반전(— 사실은 X다), "X가 아니라
   Y다" 식 폭로 구조, 가운뎃점으로 이질적 항목 묶기(90일·ON),
   하이픈 조어(0-이하) 금지. 괄호·콜론·줄바꿈을 쓸 것.
9. 다의어는 실제 통용 의미를 확인한다. 노이즈(≠소음), 동기화(≠대사),
   빠짐없이(≠총체적), 어느 모로 보나 더(≠엄격히 더).
10. 자유롭게 쓰이지 않는 형태소를 붙이지 말 것 (평 Sync ✗, 부수 발견 ✗).

## 넘기기 전에 확인할 것

- 영어 기술 용어를 한자어로 바꾼 곳이 있는가 (규칙 1, 3)
- 한 대상을 두 이름으로 부른 곳이 있는가 (규칙 3)
- 한 문장에 절이 두 개 이상 붙은 곳이 있는가 (규칙 6)
- 문장 끝이 '-다'가 아닌 곳이 있는가 (규칙 7)
- em dash 반전, "X가 아니라 Y다" 구조, 가운뎃점 묶기가 남았는가 (규칙 8)
- 은유를 그대로 옮긴 곳이 있는가 (규칙 4)
- 무생물이 주어인데 능동 동사를 쓴 곳이 있는가 (규칙 5)
- 자가 점검 명령: `grep -c '가 아니라' <파일>` 과 `grep -c '이 아니라' <파일>` 의
  합이 5를 넘으면 규칙 8 을 다시 훑는다 (긴 문서에서 눈으로 놓치기 쉬운 부류다)

고칠 곳을 찾으면 규칙 번호를 근거로 적는다.
