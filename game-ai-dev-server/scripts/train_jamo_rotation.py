"""T-152 자모 듀얼 헤드 앙상블 학습 (회전 증강) — 운영 모델 jamo-31-ensemble-v2 재현.

실행 환경: GPU 학습 서버, TensorFlow 전용 venv.
    ~/tfvenv/bin/python code-v3/scripts/train_jamo_rotation.py

배경: T-151 배포 후 실사용에서 `ㅡ`가 거의 인식되지 않았다. locked test에서는 recall 1.00,
confidence 0.995였으므로 모델·임계값 문제가 아니라 **손목 각도**(test에 없는 조건) 문제였다.
`ㅡ/ㅣ/ㅜ`는 서로 회전 관계이고 학습 영상이 자모당 1개뿐이라 특정 각도만 학습됐다.

기법: 학습 샘플의 60%에 손목 회전 증강을 적용한다.
- v2(55) : 20개 2D bone vector를 in-plane 회전(±22°)
- v3(78) : 20개 3D direction과 palm normal을 z축 회전(±22°) + 일부 y축 회전(±15°)
각도는 뼈 벡터에 실제 회전행렬을 곱해 만들며, 하드네거티브 margin 쌍은 유지한다.

입력
- ``data/both_video_seq.npz`` (extract_both.py: 같은 영상 프레임에서 v2·v3 동시 추출)
- ``dataset/seq_*.npy``      (세션 캡처 시퀀스, v2 55값 — v2 헤드 학습에 추가)

출력: ``code-v3/outputs/rot-final/`` — jamo31-v2big.keras / jamo31-v3.keras / eval.json
배포용 TFLite는 export_clean.py(LSTM unroll, Flex 미사용)로 변환한다.

실측(T-152, locked test 1900): accuracy 98.42%, <0.90 1개(ㅓ 0.705).
회전 강건성: test를 ±10°/±20° 회전시켜도 전체 0.983~0.984, `ㅡ` recall 1.000 유지.
자세한 조건·한계·폐기된 후속 시도는 docs/recognition/model-evaluation.md T-152 참고.
"""
import os, glob, json
os.environ.setdefault('TF_CPP_MIN_LOG_LEVEL', '2')
import numpy as np
import tensorflow as tf
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, precision_recall_fscore_support

SEED = 20260721
np.random.seed(SEED)
tf.random.set_seed(SEED)
JAMO = ["ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
        "ㅏ", "ㅑ", "ㅓ", "ㅕ", "ㅗ", "ㅛ", "ㅜ", "ㅠ", "ㅡ", "ㅣ", "ㅐ", "ㅒ", "ㅔ", "ㅖ", "ㅢ", "ㅚ", "ㅟ"]
IDX = {l: i for i, l in enumerate(JAMO)}

# hard-negative pairs found from the confusion matrix of the previous round
PAIRS = [('ㅣ', 'ㅡ'), ('ㅗ', 'ㅑ'), ('ㅗ', 'ㅖ'), ('ㅗ', 'ㅣ'), ('ㅜ', 'ㅏ')]
PM = np.zeros((31, 31), dtype=np.float32)
for a, c in PAIRS:
    PM[IDX[a], IDX[c]] = 1.0
    PM[IDX[c], IDX[a]] = 1.0
PMt = tf.constant(PM)

b = np.load('data/both_video_seq.npz', allow_pickle=True)
V2, V3, Y, SP = b['X2'], b['X3'], b['Y'], b['SP']
tr, te = SP == 'train', SP == 'test'
yt = Y[te]

sx, sy = [], []
for p in sorted(glob.glob('dataset/seq_*.npy')):
    sym = os.path.basename(p)[:-4].split('_')[1]
    if sym not in IDX:
        continue
    v = np.load(p).astype(np.float32)[:, :, :55]
    sx.append(v)
    sy.append(np.full(len(v), IDX[sym]))
sx, sy = np.concatenate(sx), np.concatenate(sy)


def rot2d(seq, deg):
    """feature_v2: rotate the 20 2-D unit bone vectors in-plane."""
    out = seq.copy()
    th = np.radians(deg); c, s = np.cos(th), np.sin(th)
    v = out[..., :40].reshape(*out.shape[:-1], 20, 2)
    x = v[..., 0] * c - v[..., 1] * s
    y = v[..., 0] * s + v[..., 1] * c
    out[..., :40] = np.stack([x, y], -1).reshape(*out.shape[:-1], 40)
    return out


def rot3d(seq, deg, axis='z'):
    """feature_v3: rotate the 20 3-D directions and the palm normal."""
    out = seq.copy()
    th = np.radians(deg); c, s = np.cos(th), np.sin(th)
    if axis == 'z':
        R = np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]], dtype=np.float32)
    elif axis == 'y':
        R = np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]], dtype=np.float32)
    else:
        R = np.array([[1, 0, 0], [0, c, -s], [0, s, c]], dtype=np.float32)
    d = out[..., :60].reshape(*out.shape[:-1], 20, 3) @ R.T
    out[..., :60] = d.reshape(*out.shape[:-1], 60)
    out[..., 75:78] = out[..., 75:78] @ R.T
    return out


def bal_rot(x, y, dim):
    """Class balance + rotation augmentation on ~60% of the samples."""
    rng = np.random.default_rng(SEED)
    t = int(min(max(np.bincount(y, minlength=31)), 1400))
    bx, by = [], []
    for ci in range(31):
        s = x[y == ci]
        if len(s) == 0:
            continue
        v = s[rng.choice(len(s), t, replace=len(s) < t)].copy()
        k = int(t * 0.6)
        degs = rng.uniform(-22, 22, k).astype(np.float32)
        for j in range(k):
            v[j] = rot2d(v[j], degs[j]) if dim == 55 else rot3d(v[j], degs[j], 'z')
        if dim == 78:
            k2 = int(t * 0.3)
            d2 = rng.uniform(-15, 15, k2).astype(np.float32)
            for j in range(k2):
                idx = k + j if k + j < t else j
                v[idx] = rot3d(v[idx], d2[j], 'y')
        v += rng.normal(0, 0.01, v.shape).astype(np.float32)
        bx.append(v)
        by.append(np.full(t, ci))
    bx, by = np.concatenate(bx), np.concatenate(by)
    order = rng.permutation(len(by))
    return bx[order], by[order]


def mk_loss(margin=0.25, w=0.3):
    ce = tf.keras.losses.SparseCategoricalCrossentropy()

    def f(a, yp):
        base = ce(a, yp)
        yi = tf.cast(tf.reshape(a, [-1]), tf.int32)
        tgt = tf.gather_nd(yp, tf.stack([tf.range(tf.shape(yi)[0]), yi], 1))
        riv = tf.reduce_max(yp * tf.gather(PMt, yi), axis=1)
        return base + w * tf.reduce_mean(tf.nn.relu(margin + riv - tgt))
    return f


def fit(x, y, dim, tag):
    tri, vai = train_test_split(np.arange(len(y)), test_size=0.15, random_state=SEED, stratify=y)
    bx, by = bal_rot(x[tri], y[tri], dim)
    r = tf.keras.regularizers.l2(0.001)
    m = tf.keras.Sequential([
        tf.keras.Input((10, dim)),
        tf.keras.layers.GaussianNoise(0.006),
        tf.keras.layers.LSTM(96, kernel_regularizer=r),
        tf.keras.layers.Dropout(0.3),
        tf.keras.layers.Dense(48, activation='relu', kernel_regularizer=r),
        tf.keras.layers.Dropout(0.3),
        tf.keras.layers.Dense(31, activation='softmax', kernel_regularizer=r),
    ])
    m.compile(optimizer=tf.keras.optimizers.Adam(1e-3), loss=mk_loss(), metrics=['accuracy'])
    m.fit(bx, by, validation_data=(x[vai], y[vai]), epochs=70, batch_size=128, verbose=0,
          callbacks=[tf.keras.callbacks.EarlyStopping(monitor='val_accuracy', patience=12, restore_best_weights=True),
                     tf.keras.callbacks.ReduceLROnPlateau(monitor='val_loss', patience=4, factor=0.5, min_lr=1e-6)])
    print(tag, 'done', flush=True)
    return m


mA = fit(np.concatenate((sx, V2[tr])), np.concatenate((sy, Y[tr])), 55, 'A_rot')
mB = fit(V3[tr], Y[tr], 78, 'B_rot')
pa = mA.predict(V2[te], batch_size=512, verbose=0)
pb = mB.predict(V3[te], batch_size=512, verbose=0)
ens = 0.5 * pa + 0.5 * pb
pred = ens.argmax(1)
acc = accuracy_score(yt, pred)
pr, rc, f1, su = precision_recall_fscore_support(yt, pred, labels=np.arange(31), zero_division=0)
print('ROT acc %.4f min %.3f <0.9 %d' % (acc, rc.min(), (rc < 0.9).sum()), flush=True)
print('below90:', {JAMO[i]: round(float(rc[i]), 3) for i in range(31) if rc[i] < 0.9}, flush=True)

# rotation robustness: rotate the locked test set and re-measure
print('--- rotation robustness (test rotated) ---', flush=True)
for deg in [-20, -10, 10, 20]:
    e = (0.5 * mA.predict(rot2d(V2[te], deg), batch_size=512, verbose=0)
         + 0.5 * mB.predict(rot3d(V3[te], deg, 'z'), batch_size=512, verbose=0))
    p = e.argmax(1)
    i = IDX['ㅡ']
    m = yt == i
    print(' %+d deg: acc %.3f  ㅡrecall %.3f' % (deg, accuracy_score(yt, p), (p[m] == i).mean()), flush=True)

out = 'code-v3/outputs/rot-final'
os.makedirs(out, exist_ok=True)
mA.save(out + '/jamo31-v2big.keras')
mB.save(out + '/jamo31-v3.keras')
json.dump({'acc': round(float(acc), 4), 'minRecall': round(float(rc.min()), 4),
           'perClass': {JAMO[i]: round(float(rc[i]), 4) for i in range(31)}},
          open(out + '/eval.json', 'w'), ensure_ascii=False, indent=2)
print('SAVED', out, flush=True)
