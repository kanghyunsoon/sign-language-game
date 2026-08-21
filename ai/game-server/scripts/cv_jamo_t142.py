"""T-142 보조 진단 — 자모 landmark 특징 5-fold Group 교차검증.

실행 환경: GPU 학습 서버 ``~/sign_language_training`` (venv python).
    python code-v3/scripts/cv_jamo_t142.py

Roboflow 자모 landmark 특징을 소스 그룹 단위 StratifiedGroupKFold(누수 차단)로 교차검증해
자모 class별 안정적 recall을 진단한다. 이는 **landmark 분류기** 기준이며(이미지 EfficientNet과 다름),
landmark 경로가 자모에 약함을 확인하는 용도다(그래서 자모는 이미지 모델을 사용).

경로는 학습 서버의 code-v3 워크스페이스 기준 상대경로다.
"""
import numpy as np
from sklearn.ensemble import ExtraTreesClassifier
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.metrics import classification_report

d = np.load('data/roboflow/artifacts/roboflow-v1-f16.npz', allow_pickle=True)
X = d['features'].mean(axis=1)          # (N,78) 10프레임 평균
y = d['labels']
src = np.array([s.rsplit('.', 1)[0].rsplit('_', 1)[0] for s in d['sources']])  # 증강 누수 차단용 그룹

skf = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=42)
pred = np.empty_like(y)
for tr, te in skf.split(X, y, groups=src):
    clf = ExtraTreesClassifier(n_estimators=500, random_state=42, n_jobs=-1).fit(X[tr], y[tr])
    pred[te] = clf.predict(X[te])

rep = classification_report(y, pred, digits=3, output_dict=True, zero_division=0)
skip = ('accuracy', 'macro avg', 'weighted avg')
cls = {k: v for k, v in rep.items() if isinstance(v, dict) and 'recall' in v and k not in skip}
print('JAMO 5-fold GroupCV  acc', round(rep['accuracy'], 4), 'macroF1', round(rep['macro avg']['f1-score'], 4))
print('min_recall', round(min(v['recall'] for v in cls.values()), 4))
weak = ['ㄱ', 'ㄹ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅔ', 'ㅖ']
print('--- weak classes (CV, larger test) ---')
for k in weak:
    if k in cls:
        v = cls[k]
        print(' ', k, 'recall', round(v['recall'], 3), 'f1', round(v['f1-score'], 3), 'n', int(v['support']))
print('below90:', sorted((round(v['recall'], 3), k, int(v['support'])) for k, v in cls.items() if v['recall'] < 0.90))
