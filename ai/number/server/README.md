# 지숫자 인식 WebSocket 서버

`ai/game-server`와 **동일한 WebSocket 계약**을 구현한다. 프런트는 포트만 바꾸면 두 서버 중 어느 쪽에도 붙을 수 있다. 요청 타입, 필드 이름, 오류 코드, 응답 형태가 모두 같다.

```
ws://localhost:8766/number     지숫자 10종 + none  (이 서버)
ws://localhost:8765            자모 서버           (변경 없음)
```

두 서버를 나란히 띄우는 것을 전제로 포트를 다르게 잡았다. 지숫자 모델은 아직 인증 전이므로 자모 서버를 대체하지 않는다.

**경로 `/number`는 필수이며 다른 경로는 404로 거절한다.** 자모 서버는 모든 경로를 받으므로, 클라이언트가 포트를 잘못 가리켜도 연결은 되고 이상 동작은 한참 뒤에 드러난다. 경로에 모델 이름을 넣으면 그 실수가 연결 시점에 실패하고, 응답 본문이 어느 서버에 닿았는지 알려준다.

쿼리스트링과 끝 슬래시는 무시하므로 `/number/`, `/number?room=7` 모두 같은 경로다.

자모 서버와 마찬가지로 **MediaPipe 랜드마크만 받는다.** 카메라·이미지·영상은 이 프로세스에 들어오지 않는다.

## 실행

```powershell
cd ai/number
pip install -r requirements.txt
python -m server.main
```

| 환경변수 | 기본값 | 용도 |
| --- | --- | --- |
| `HANDPRACTICE_NUMBER_MODEL_DIR` | `models/number-10-v1` | 다른 번들 지정 |
| `HANDPRACTICE_NUMBER_PORT` | `8766` | 포트 변경 |
| `HANDPRACTICE_NUMBER_HOST` | `localhost` | 바인드 주소. 다른 장비에서 붙이려면 `0.0.0.0` |
| `HANDPRACTICE_NUMBER_PATH` | `/number` | WebSocket 경로 |

테스트:

```powershell
python -m unittest discover -s tests -t . -v
```

## 메시지

### 요청

| type | 필드 | 응답 |
| --- | --- | --- |
| `GET_CAPABILITIES` | — | `CAPABILITIES` |
| `LANDMARK_FRAME` | `frameId`, `capturedAt`, `handedness`, `landmarks[21]` | `PREDICTION` |
| `HAND_NOT_DETECTED` | `capturedAt` | 없음 |
| `RESET_SEQUENCE` | — | 없음 |

`landmarks`는 21개이며 각 항목은 유한한 `x`, `y`, `z`를 갖는다. 개수가 다르면 `INVALID_LANDMARK_COUNT`다.

### 응답

```json
{ "type": "CAPABILITIES", "modelVersion": "number-10-v1",
  "supportedSymbols": ["1","2","3","4","5","6","7","8","9","10","none"],
  "sequenceLength": 1, "frameInput": true, "featureVersion": "v3",
  "confirmationAuthority": "FRONTEND_TEMPORAL_DECODER",
  "competitiveSymbols": [], "confidenceThresholds": { "1": 1.0, ... } }

{ "type": "PREDICTION", "frameId": 7, "symbol": "9", "confidence": 0.94,
  "isStable": false, "predictedAt": 1234,
  "topCandidates": [ { "symbol": "9", "confidence": 0.94 }, ... ] }

{ "type": "ERROR", "code": "UNSUPPORTED_MESSAGE", "message": "..." }
```

오류 코드는 자모 서버와 같다: `INVALID_JSON`, `INVALID_MESSAGE`, `INVALID_LANDMARKS`, `INVALID_LANDMARK`, `INVALID_LANDMARK_COUNT`, `UNSUPPORTED_MESSAGE`, `INVALID_INPUT`.

## 자모 서버와 다른 점

두 가지뿐이며, 둘 다 이 모델이 10프레임 창이 아니라 **한 프레임**을 분류하는 데서 나온다.

| | 자모 서버 | 이 서버 |
| --- | --- | --- |
| 경로 | 아무거나 | **`/number` 고정** |
| `sequenceLength` | 10 | **1** |
| 추가 필드 | — | `frameInput`, `featureVersion` |
| 특징 | `feature_v2` 55차원 | `feature_v3` 78차원 |
| `RESET_SEQUENCE` | 프레임 창 비움 | 미검출 타이머만 초기화 (창이 없음) |

`sequenceLength`를 그대로 두지 않고 1로 보고하는 이유는, 클라이언트가 그 값을 읽었을 때 사실과 맞아야 하기 때문이다. `frameInput`을 함께 보내 두 서버를 구분할 수 있게 했다.

부수 효과로 자모 서버의 실패 모드 하나가 사라진다. 시퀀스 버전은 연결 직후 창이 찰 때까지 첫 프레임을 복제해 채우므로, 아직 갖지 않은 데이터에 대해 잠시 예측을 보고한다. 프레임 단위에는 그 구간이 없다.

## 확정은 서버가 하지 않는다

`isStable`은 항상 `false`이고 `SIGN_CONFIRMED`를 보내지 않는다. `confirmationAuthority`가 `FRONTEND_TEMPORAL_DECODER`인 것과 같은 의미다. 확정은 프런트가 `recognition-policy.json`의 창 길이·평균 신뢰도·유지시간 규칙으로 판단한다. 서버는 프레임마다 본 것만 보고한다.

## 안전 gate

`contracts/readiness-number.json`이 class별 threshold와 `competitiveEligible`을 관리한다. **현재 전 class가 부적격**이므로 `competitiveSymbols`는 빈 배열이다. 인증 전 모델이 경쟁 모드에 노출되지 않게 하는 장치이며, 측정이 끝나면 이 파일만 교체한다.

## 프로토콜 사본 관리

`server/messages.py`는 `ai/game-server/app/messages.py`의 사본이다. import가 아니라 사본인 이유는 이 폴더가 독립적이어야 하기 때문이지만, 사본이 조용히 어긋나면 프런트가 깨진다.

그래서 `tests/test_server_contract.py`가 원본 파일의 SHA-256을 검사하고, 두 구현의 파서를 **같은 payload로 대조**한다. 정상 요청 4종의 파싱 결과, 잘못된 요청 9종의 오류 코드, 응답 빌더 4종의 출력이 모두 일치해야 한다. 원본이 바뀌면 테스트가 실패하면서 "포팅할지, 이 버전을 유지할지"를 결정하게 만든다.
