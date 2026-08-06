# 수어 단어 모델 정확성 테스트 (ksl-word-v7)

21단어 + `wrong`(오류 수행 감지) 모델을 웹캠으로 직접 테스트하는 환경입니다.
데이터셋 없이 이 폴더만으로 동작합니다 (CPU만 사용, GPU 불필요).

## 설치 (Python 3.10+)

```bash
cd word-accuracy-test
pip install -r requirements.txt
```

## 실행

### 셀프 채점 모드 (권장 — 정확성 테스트용)

```bash
python inference/self_test.py --rolling
```

- 화면 상단에 목표 단어 표시 (터미널에 한국어 뜻 출력)
- **그냥 동작하면 자동 감지** → 손을 멈추면 0.5초 뒤 자동 판정 (버튼 없음)
- 키: `n`/`p` 단어 이동, `q` 종료(세션 요약 출력)
- 모든 시도는 `dataset/self_test_results.csv`에 자동 누적 → **이 파일을 공유해주세요**

### 자유 인식 모드 (스트리밍 HUD)

```bash
python inference/run_webcam.py
```

## 판정 종류

| 화면 표시 | 의미 |
|---|---|
| CORRECT | 정답 |
| WRONG (direction/form) | 방향·형태가 틀린 수행으로 감지 (역방향, 정지 자세 등) |
| WRONG DETAIL (finger) | 손가락 규칙 위반 (예: car를 주먹으로) — 상세는 터미널 |
| OUT OF RANGE | 동작이 너무 작음/느림/위치 이탈 — 상세는 터미널 |
| MISS | 다른 단어로 오인식 |
| LOW CONF | 확신 부족 (임계값 0.5 미만) |

`guard fail (see terminal)`이 뜨면 **명령을 실행한 콘솔 창**에 어떤 항목이
얼마나 벗어났는지 출력됩니다 (예: `동작 진폭 0.08 (허용 0.15~)`).

## 테스트 방법 제안

1. 21단어 각각 2~3회 정방향 수행 → CORRECT 비율 확인
2. 방향 단어(swim, walk, moon, airplane, subway, bad, sun)는 역방향도 → WRONG 떠야 정상
3. 오류 수행 테스트: 준비자세만 취하고 멈추기 / 대충 작게 흉내내기 / car를 주먹으로
   / moon을 손가락 붙인 채로 → 각각 WRONG·OUT OF RANGE 계열이 떠야 정상
4. **억울한 판정**(정상 수행인데 거절)이 나오면 터미널 로그 그대로 복사해서 공유

## 참고

- 21단어: airplane bad bicycle bus car good helicopter hello moon motorcycle rain
  run ship star subway sun swim thankyou train walk wind
- 판정이 너무 깐깐하면 `--conf 0.4`로 낮춰 비교 가능
- 카메라: 정면 상반신(어깨 포함)이 나와야 합니다. 어깨가 안 잡히면 판정 보류됨
- 학습 기준 성능: 미학습 화자 교차검증 93.2%±1.0
