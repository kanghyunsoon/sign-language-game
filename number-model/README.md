# 지숫자 전용 인식 모델 (number-10-v1)

지숫자 10종(`1`~`10`)과 `none`을 **한 프레임씩** 판정하는 모델과 서버다. 배포 중인 자모 모델(`game-ai-dev-server`)은 **한 파일도 수정하지 않는다.** 이 폴더 안에서만 동작한다.

## 어디서부터 볼지

| 알고 싶은 것 | 문서 |
| --- | --- |
| 성능이 얼마이고 무엇을 시도해봤는지 | [`docs/number-model-log.md`](docs/number-model-log.md) |
| WebSocket API | [`server/README.md`](server/README.md) |
| 사진을 어떻게 찍어야 하는지 | [`collection-template/README.md`](collection-template/README.md) |

## 현재 성능

레시피 결정에 쓰이지 않은 **신규 참가자 3명**(240장) 기준. 이것이 가장 신뢰할 수 있는 값이다.

| | 값 |
| --- | ---: |
| 숫자 정확도 | 0.946 |
| **확정률** | **0.800** |
| 미학습 손모양 오확정 | 1.2% |
| `targetMet` | **false** |

`recognition-policy.json`의 `minimumConfirmationRate`가 0.85이므로 아직 미달이다. `contracts/readiness-number.json`이 전 class를 부적격으로 두어 경쟁 모드에 노출되지 않는다.

**병목은 참가자 수다.** 1인당 장수는 6장에서 8장으로 늘려도 +0.008뿐이라 포화됐고, 학습 인원은 2→4명에서 최악 최저 확정률이 0.000→0.375로 아직 상승 중이다. 근거는 회차 로그의 「다음 회차」 절에 있다.

## 구조

```
numbermodel/          모델 코드
  labels.py           11 class 계약. 의존성 없음 (원본 이미지만 있는 장비용)
  features.py         feature_v3 78차원. app/feature_v3.py의 사본 + 원본 해시
  adapter.py          랜드마크 → 11개 확률. manifest·SHA-256·classes_ 검증

server/               WebSocket 서버 (자모 서버와 동일 계약, 포트 8766)
scripts/              추출 · 학습 · 진단 · 웹캠 데모
tests/                33개
docs/                 회차 기록과 평가 JSON
contracts/            안전 gate
models/number-10-v1/  학습된 번들
collection-template/  참가자별 촬영 폴더 템플릿
```

## 왜 별도 모델인가

기존 41-class tree의 숫자 head와 세 가지가 다르다.

| | 기존 | 이 모델 |
| --- | --- | --- |
| 입력 | `[1, 10, 55]` 시퀀스 | **단일 프레임 `[78]`** |
| 특징 | `feature_v2` 2-D | **`feature_v3` 3-D + palm normal** |
| 도메인 판정 | tree가 자모/숫자 라우팅 | **모델 자체의 `none` class** |

지숫자는 정적 손모양이라 10프레임 창으로 모델링할 대상이 없다. 기존 숫자 학습은 정적 이미지를 10회 복제해 220차원 summary의 `std`와 `last-first` 절반이 항상 0인데, 실제 카메라 프레임은 그렇지 않다. 프레임 단위로 가면 그 불일치가 생기지 않는다. 자세한 근거는 회차 로그 3절에 있다.

## 실행

```powershell
cd number-model
pip install -r requirements.txt        # 서버 + 학습
python -m server.main                  # ws://localhost:8766

python -m unittest discover -s tests -t . -v
```

이미지에서 랜드마크를 뽑거나 데모를 돌릴 때만 추가 의존성이 필요하다.

```powershell
pip install -r requirements-extract.txt   # mediapipe, Pillow, pillow-heif
pip install -r requirements-demo.txt      # + opencv, matplotlib
```

서버는 프런트가 추출한 랜드마크를 받으므로 **MediaPipe도 tensorflow도 필요 없다.**

## 학습 재현

```powershell
# 1) 이미지 → 랜드마크·특징 (소스마다 한 번)
python scripts/extract_number_frames.py --dataset <소스> --output <npz> \
  --layout participant --running-mode video \
  --source-name <태그> --license <라이선스> --landmarker <hand_landmarker.task>

# 2) 학습·평가
python scripts/train_number_model.py --features <npz>... \
  --candidate extra-trees --max-features 0.3 --none-sample 200 \
  --drop-source-folders space,bieup,nieun,a --none-holdout-fraction 0.25 \
  --test-participants <...> --valid-participants <...> --write-bundle
```

`--drop-source-folders`의 네 폴더는 임의 선택이 아니다. `space`·`bieup`ㅂ은 숫자 `4`, `nieun`ㄴ은 `6`, `a`ㅏ는 `1`과 실질적으로 같은 손모양이라 `none`으로 가르치면 모순이 된다. 나머지 32개 폴더는 leave-one-out으로 검증해 뺄 이유가 없음을 확인했다. 근거는 회차 로그 T-153·T-157에 있다.

원본 이미지와 npz는 저장소에 넣지 않는다. 라이선스·용량 때문이며, 실명도 저장소에 들어가지 않게 참가자 ID는 `p01` 형식만 쓴다.

## 진단 도구

| 스크립트 | 용도 |
| --- | --- |
| `survey_number_data.py` | 문서에 적힌 데이터 경로가 실제로 있는지 조사. 표준 라이브러리만 쓰므로 `ssh <host> 'python3 -' < 파일`로 원격 실행 가능 |
| `probe_none_collisions.py` | negative 중 어떤 손모양이 어느 숫자와 충돌하는지. `nieun`·`a` 충돌을 이 도구가 짚어냈다 |
| `probe_hybrid.py` | 게이트+헤드 합성 측정 (폐기했으나 근거로 보존) |
| `live_demo.py` | 웹캠 실시간. 오프라인 표로는 안 보이는 문제를 잡는다 — 숫자 `1`이 확정되지 않던 것과 `10`이 `none`과 겹치는 것을 이 데모가 발견했다 |

## 사본 관리

이 폴더는 `feature_v3`와 메시지 프로토콜의 **사본**을 갖는다. import가 아닌 이유는 독립성이지만, 사본이 조용히 어긋나면 학습해둔 번들이 무효가 되거나 프런트가 깨진다.

그래서 두 테스트가 원본 파일의 SHA-256을 검사하고 동작을 대조한다.

- `test_feature_parity.py` — 무작위 손 40개 × 좌우손에서 두 구현의 출력이 동일한지
- `test_server_contract.py` — 정상 요청 4종의 파싱, 잘못된 요청 9종의 오류 코드, 응답 빌더 4종의 출력, `CAPABILITIES` 키 부분집합

원본이 바뀌면 테스트가 실패하면서 "포팅할지, 이 버전을 유지할지"를 결정하게 만든다.
