"""T-142 지문자 leakage-safe 대형 test 재분할.

실행 환경: GPU 학습 서버 ``~/sign_language_training`` (venv python).
    python code-v3/scripts/resplit_jamo_bigtest.py

Roboflow 자모 아티팩트(``roboflow-v1-f16.npz``)를 **소스(원본 촬영) 그룹 단위**로
재분할(test 28% / valid 12% / train 60%)해 증강 누수 없이 자모 test를 키운
``roboflow-v1-f16-bigtest.npz`` 를 생성한다.

주의: 재학습 시 ``train_roboflow_jamo_image_t10.py`` 에서 **--all-jamo-images 를 빼야**
npz splits(대형 test)가 적용된다. 이 플래그가 켜져 있으면 split을 npz가 아니라
폴더명(train/valid/test)에서 읽어 재분할이 무시된다(T-142 함정 참고).

경로는 학습 서버의 code-v3 워크스페이스 기준 상대경로다.
"""
import collections

import numpy as np

rng = np.random.default_rng(42)
src_npz = 'data/roboflow/artifacts/roboflow-v1-f16.npz'
d = np.load(src_npz, allow_pickle=True)
out = {k: d[k] for k in d.keys()}
labels = d['labels']
sources = d['sources']


def basefn(s):
    """원본 촬영 base 이름(증강 hash 제거)."""
    return s.rsplit('/', 1)[-1].split('.rf.')[0]


base = np.array([basefn(s) for s in sources])
splits = np.array(['train'] * len(labels), dtype=d['splits'].dtype)
for c in sorted(set(labels.tolist())):
    idx = np.where(labels == c)[0]
    bs = np.array(sorted(set(base[idx].tolist())))
    rng.shuffle(bs)
    n = len(bs)
    n_test = max(1, round(n * 0.28))
    n_val = max(1, round(n * 0.12))
    test_b = set(bs[:n_test].tolist())
    val_b = set(bs[n_test:n_test + n_val].tolist())
    for i in idx:
        b = base[i]
        splits[i] = 'test' if b in test_b else ('valid' if b in val_b else 'train')
out['splits'] = splits

# leakage guard: 같은 source base가 split 사이에 겹치지 않음을 검증
for c in sorted(set(labels.tolist())):
    idx = np.where(labels == c)[0]
    sets = {sp: set(base[idx][splits[idx] == sp].tolist()) for sp in ('train', 'valid', 'test')}
    assert not (sets['train'] & sets['test']) and not (sets['valid'] & sets['test']), c

np.savez_compressed('data/roboflow/artifacts/roboflow-v1-f16-bigtest.npz', **out)
byc = collections.Counter(zip(splits.tolist(), labels.tolist()))
cls = sorted(set(labels.tolist()))
print('overall', dict(collections.Counter(splits.tolist())))
print('min test/class', min(byc[('test', c)] for c in cls), 'max', max(byc[('test', c)] for c in cls))
print('weak test counts', {c: byc[('test', c)] for c in ['ㄱ', 'ㄹ', 'ㅊ', 'ㅋ', 'ㅌ']})
print('SAVED roboflow-v1-f16-bigtest.npz')
