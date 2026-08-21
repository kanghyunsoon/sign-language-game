"""T-150 자모 31-class LSTM 학습 (feature_v3, 78값) — 운영 헤드 재현.

실행 환경: GPU 학습 서버, TensorFlow 전용 venv.
    ~/tfvenv/bin/python code-v3/scripts/train_jamo_v3.py

입력: ``data/v3_video_seq.npz`` (extract_v3_video.py 산출물)
출력: ``code-v3/outputs/jhead-v3feat/`` — jamo-31-v3.keras / jamo-31-v3.tflite / eval.json

실측(T-150, locked test 955): accuracy 93.3%, min-recall 0.52.
v2(55값) 대비 ㅅ 0.42→1.00, ㅁ 0.70→1.00, ㅠ 0.59→1.00, ㅔ 0.53→0.97.
자세한 조건·한계는 docs/recognition/model-evaluation.md T-150 참고.
"""
import os, json
os.environ.setdefault('TF_CPP_MIN_LOG_LEVEL', '2')
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, precision_recall_fscore_support, confusion_matrix
import tensorflow as tf

SEED = 20260721
np.random.seed(SEED)
tf.random.set_seed(SEED)
JAMO = ["ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
        "ㅏ", "ㅑ", "ㅓ", "ㅕ", "ㅗ", "ㅛ", "ㅜ", "ㅠ", "ㅡ", "ㅣ", "ㅐ", "ㅒ", "ㅔ", "ㅖ", "ㅢ", "ㅚ", "ㅟ"]

d = np.load('data/v3_video_seq.npz', allow_pickle=True)
X, Y, SP = d['X'], d['Y'], d['SP']
trX, trY = X[SP == 'train'], Y[SP == 'train']
teX, teY = X[SP == 'test'], Y[SP == 'test']
print('v3 train', trX.shape, 'test', teX.shape, flush=True)

tri, vai = train_test_split(np.arange(len(trY)), test_size=0.15, random_state=SEED, stratify=trY)
tx, ty = trX[tri], trY[tri]
vx, vy = trX[vai], trY[vai]

# class balance + landmark-space noise augmentation (directions / angles / palm normal)
rng = np.random.default_rng(SEED)
target = int(min(max(np.bincount(ty, minlength=31)), 900))
bx, by = [], []
for ci in range(31):
    src = tx[ty == ci]
    if len(src) == 0:
        continue
    ch = rng.choice(len(src), target, replace=len(src) < target)
    v = src[ch].copy()
    if len(src) < target:
        v[:, :, :60] += rng.normal(0, 0.01, v[:, :, :60].shape).astype(np.float32)
        v[:, :, 60:75] += rng.normal(0, 0.8, v[:, :, 60:75].shape).astype(np.float32)
        v[:, :, 75:] += rng.normal(0, 0.01, v[:, :, 75:].shape).astype(np.float32)
    bx.append(v)
    by.append(np.full(target, ci))
bx = np.concatenate(bx)
by = np.concatenate(by)
order = rng.permutation(len(by))
bx, by = bx[order], by[order]
print('balanced', bx.shape, flush=True)

reg = tf.keras.regularizers.l2(0.001)
model = tf.keras.Sequential([
    tf.keras.Input((10, 78)),
    tf.keras.layers.GaussianNoise(0.006),
    tf.keras.layers.LSTM(96, kernel_regularizer=reg, name='lstm'),
    tf.keras.layers.Dropout(0.3),
    tf.keras.layers.Dense(48, activation='relu', kernel_regularizer=reg),
    tf.keras.layers.Dropout(0.3),
    tf.keras.layers.Dense(31, activation='softmax', kernel_regularizer=reg),
])
model.compile(optimizer=tf.keras.optimizers.Adam(1e-3), loss='sparse_categorical_crossentropy', metrics=['accuracy'])
history = model.fit(
    bx, by, validation_data=(vx, vy), epochs=80, batch_size=128, verbose=2,
    callbacks=[
        tf.keras.callbacks.EarlyStopping(monitor='val_accuracy', patience=12, restore_best_weights=True),
        tf.keras.callbacks.ReduceLROnPlateau(monitor='val_loss', patience=4, factor=0.5, min_lr=1e-6),
    ],
)

out = 'code-v3/outputs/jhead-v3feat'
os.makedirs(out, exist_ok=True)
model.save(out + '/jamo-31-v3.keras')
converter = tf.lite.TFLiteConverter.from_keras_model(model)
converter.target_spec.supported_ops = [tf.lite.OpsSet.TFLITE_BUILTINS, tf.lite.OpsSet.SELECT_TF_OPS]
converter._experimental_lower_tensor_list_ops = False
open(out + '/jamo-31-v3.tflite', 'wb').write(converter.convert())

pred = model.predict(teX, batch_size=512, verbose=0).argmax(1)
acc = accuracy_score(teY, pred)
print('V3 JAMO acc', round(acc, 4), 'test', len(teY), flush=True)
pr, rc, f1, su = precision_recall_fscore_support(teY, pred, labels=np.arange(31), zero_division=0)
print('PER-CLASS:', flush=True)
for i in range(31):
    print(' ', JAMO[i], round(float(rc[i]), 3), 'n', int(su[i]), flush=True)
print('min-recall', round(float(rc.min()), 3), '| <0.90 count', int((rc < 0.9).sum()), flush=True)
cm = confusion_matrix(teY, pred, labels=np.arange(31))
pairs = [(int(cm[i, j]), JAMO[i], JAMO[j]) for i in range(31) for j in range(31) if i != j and cm[i, j] > 0]
print('TOPCONF:', [(a, b, n) for n, a, b in sorted(pairs, reverse=True)[:10]], flush=True)
json.dump({
    'labels': JAMO,
    'featureSize': 78,
    'acc': round(float(acc), 4),
    'perClassRecall': {JAMO[i]: round(float(rc[i]), 4) for i in range(31)},
    'minRecall': round(float(rc.min()), 4),
    'epochs': len(history.history['loss']),
}, open(out + '/eval.json', 'w'), ensure_ascii=False, indent=2)
print('SAVED', out, flush=True)
