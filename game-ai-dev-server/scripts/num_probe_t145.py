"""T-145 숫자 head 분류기 비교.

실행 환경: GPU 학습 서버 ``~/sign_language_training`` (venv python; sklearn CPU).
    python code-v3/scripts/num_probe_t145.py

랜드마크 숫자 특징(``data/ksl-numbers/feat_v3.npz``)에서 여러 분류기의 전체 acc·min-recall·
취약 숫자(NUM_9=digit 9, NUM_8) recall을 비교한다. 결론(T-145): KNN(k=7)이 NUM_9를
0.75→0.833, min-recall 0.75→0.833으로 올리며 전체 acc는 동일. NUM_9 상한은 ~0.833(데이터 병목).

경로는 학습 서버의 code-v3 워크스페이스 기준 상대경로다.
"""
import numpy as np
from sklearn.ensemble import ExtraTreesClassifier, RandomForestClassifier, HistGradientBoostingClassifier
from sklearn.svm import SVC
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.neighbors import KNeighborsClassifier
from sklearn.metrics import classification_report

d = np.load('data/ksl-numbers/feat_v3.npz', allow_pickle=True)
Xtr, ytr, Xte, yte = d['xtr'], d['ytr'], d['xte'], d['yte']


def evalc(name, clf):
    clf.fit(Xtr, ytr)
    p = clf.predict(Xte)
    r = classification_report(yte, p, output_dict=True, zero_division=0)
    cls = {k: v for k, v in r.items() if isinstance(v, dict) and k not in ('macro avg', 'weighted avg')}
    acc = r['accuracy']
    minr = min(v['recall'] for v in cls.values())
    n9 = r.get('NUM_9', {}).get('recall')
    n8 = r.get('NUM_8', {}).get('recall')
    print('%-24s acc %.3f  min %.3f  NUM_9 %.3f  NUM_8 %.3f' % (name, acc, minr, n9, n8))


evalc('ExtraTrees500(base)', ExtraTreesClassifier(n_estimators=500, random_state=42, n_jobs=-1))
evalc('ExtraTrees1000bal', ExtraTreesClassifier(n_estimators=1000, class_weight='balanced', random_state=42, n_jobs=-1))
evalc('RandomForest800', RandomForestClassifier(n_estimators=800, random_state=42, n_jobs=-1))
evalc('HistGB400', HistGradientBoostingClassifier(max_iter=400, random_state=42))
evalc('SVC_rbf', make_pipeline(StandardScaler(), SVC(C=10, gamma='scale', random_state=42)))
evalc('KNN7', make_pipeline(StandardScaler(), KNeighborsClassifier(n_neighbors=7)))
