"""T-141 도메인 라우팅 하이브리드 평가.

실행 환경: GPU 학습 서버 ``~/sign_language_training`` (code-v3 워크스페이스, venv python).
    CUDA_VISIBLE_DEVICES=2 python code-v3/scripts/hybrid_eval_t141.py

자모 31class는 T-139 이미지 EfficientNet 결과(경로·가중치 불변)를 그대로 재사용하고,
숫자는 landmark feature(``data/ksl-numbers/feat_v3.npz``) + ExtraTrees(500)로 교체해
결합 41-class 지표(overall/macro/per-domain, 90% 미만 class)를 산출한다.
손실 튜닝이 아니라 아키텍처 라우팅이므로 강한 자모 class에 대한 회귀 위험이 없다.

경로는 학습 서버의 code-v3 워크스페이스 기준 상대경로다(이 repo 레이아웃과 다름).
"""
import json
from pathlib import Path

import numpy as np
from sklearn.ensemble import ExtraTreesClassifier
from sklearn.metrics import classification_report

# ---- 숫자: landmark feature + ExtraTrees ----
d = np.load('data/ksl-numbers/feat_v3.npz', allow_pickle=True)
Xtr, ytr, Xte, yte = d['xtr'], d['ytr'], d['xte'], d['yte']
clf = ExtraTreesClassifier(n_estimators=500, random_state=42, n_jobs=-1).fit(Xtr, ytr)
pred = clf.predict(Xte)
num_rep = classification_report(yte, pred, digits=3, output_dict=True, zero_division=0)

# ---- 자모: T-139 이미지 모델 결과 재사용(경로 불변) ----
a = json.load(open('code-v3/outputs/t139-khs-balanced/evaluation.json'))
tbc = a['testByClass']
skip = ('accuracy', 'macro avg', 'weighted avg')
jamo = {k: v for k, v in tbc.items()
        if isinstance(v, dict) and 'recall' in v and not k.startswith('NUM_') and k not in skip}

# ---- 결합 ----
rows = {}
for k, v in jamo.items():
    rows[k] = (v['recall'], v['f1-score'], v['support'])
for k, v in num_rep.items():
    if k in skip:
        continue
    rows[k] = (v['recall'], v['f1-score'], v['support'])

sup = sum(s for _, _, s in rows.values())
overall_acc = sum(r * s for r, _, s in rows.values()) / sup
macro_f1 = sum(f for _, f, _ in rows.values()) / len(rows)
min_recall = min(r for r, _, _ in rows.values())
below90 = sorted((round(r, 3), round(f, 3), k, int(s)) for k, (r, f, s) in rows.items() if r < 0.90)
jamo_acc = sum(v['recall'] * v['support'] for v in jamo.values()) / sum(v['support'] for v in jamo.values())
num_acc = num_rep['accuracy']

print('HYBRID overall_acc', round(overall_acc, 4))
print('macro_f1', round(macro_f1, 4))
print('jamo_acc', round(jamo_acc, 4), 'num_acc_landmark', round(num_acc, 4))
print('min_recall', round(min_recall, 4), 'classes_below90', len(below90))
print('below90:', below90)
print('NUMBERS(landmark) per-class:')
for k in sorted(num_rep, key=lambda x: (len(x), x)):
    if k in skip:
        continue
    v = num_rep[k]
    print('  digit', k, 'recall', round(v['recall'], 3), 'f1', round(v['f1-score'], 3), 'n', int(v['support']))

out = Path('code-v3/outputs/t141-khs-hybrid')
out.mkdir(parents=True, exist_ok=True)
json.dump({'experiment': 'T-141-hybrid', 'overallAcc': overall_acc, 'macroF1': macro_f1,
           'jamoAcc': jamo_acc, 'numberAccLandmark': num_acc, 'minRecall': min_recall,
           'below90': below90,
           'numbersPerClass': {k: num_rep[k] for k in num_rep if k not in skip},
           'rows': {k: list(v) for k, v in rows.items()}},
          open(out / 'evaluation.json', 'w'), ensure_ascii=False, indent=2)
print('SAVED', out / 'evaluation.json')
