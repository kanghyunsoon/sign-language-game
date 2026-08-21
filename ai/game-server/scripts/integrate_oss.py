"""T-147 OSS 신규-signer 지문자 데이터 통합.

실행 환경: GPU 학습 서버 ``~/sign_language_training`` (venv python).
    python code-v3/scripts/integrate_oss.py

Roboflow Universe ``oss-4tnzy/hangul``(CC BY 4.0, 298장, 다른 signer)을 Pascal VOC로 받아
``data/roboflow/oss-hangul/extracted``에 풀어둔 뒤 실행한다. 각 이미지의 클래스(romanized)를
트레이너의 JAMO_LABELS로 한글에 매핑하고, 전체 이미지를 기존 ``sign-language-v1`` 폴더에 복사한 뒤
bigtest npz를 확장해 ``roboflow-v1-f16-bigtest-oss.npz``를 만든다.

주의: npz의 sources/labels/splits뿐 아니라 features·handedness 등 **부가 배열도 동일 길이로 확장**해야
평가 단계 IndexError가 안 난다(T-147 함정). 재학습은 이 npz로, --all-jamo-images 없이 돌린다.

경로는 학습 서버의 code-v3 워크스페이스 기준 상대경로다.
"""
import os, glob, shutil, re, collections
import xml.etree.ElementTree as ET
import numpy as np

src = open('code-v3/scripts/train_roboflow_jamo_image_t10.py').read()
m = re.search(r'JAMO_LABELS\s*=\s*\{[^}]*\}', src, re.S)
ns = {}
exec(m.group(0), ns)
JAMO_LABELS = ns['JAMO_LABELS']

DROOT = 'data/roboflow/sign-language-v1'
OSS = 'data/roboflow/oss-hangul/extracted'
rows = []
skipped = collections.Counter()
for osp in ['train', 'valid', 'test']:
    split = 'test' if osp == 'test' else 'train'
    for xmlf in sorted(glob.glob(f'{OSS}/{osp}/*.xml')):
        root = ET.parse(xmlf).getroot()
        obj = root.find('object')
        if obj is None:
            skipped['NO_OBJECT'] += 1; continue
        name = obj.find('name').text.strip()
        jpg = xmlf[:-4] + '.jpg'
        if not os.path.exists(jpg) or name not in JAMO_LABELS:
            skipped[name if name not in JAMO_LABELS else 'NO_JPG'] += 1; continue
        dstdir = os.path.join(DROOT, split, name); os.makedirs(dstdir, exist_ok=True)
        dstname = 'OSS_' + os.path.basename(jpg)
        shutil.copy(jpg, os.path.join(dstdir, dstname))
        rows.append((f'{split}/{name}/{dstname}', JAMO_LABELS[name], split))
print('OSS rows:', len(rows), '| skipped:', dict(skipped))

d = np.load('data/roboflow/artifacts/roboflow-v1-f16-bigtest.npz', allow_pickle=True)
n = len(rows)
S = [r[0] for r in rows]; L = [r[1] for r in rows]; SP = [r[2] for r in rows]
out = {}
for k in d.keys():
    arr = d[k]
    if k == 'sources':
        out[k] = np.array(arr.astype(str).tolist() + S)
    elif k == 'labels':
        out[k] = np.array(arr.astype(str).tolist() + L)
    elif k == 'splits':
        out[k] = np.array(arr.astype(str).tolist() + SP)
    elif k == 'handedness':
        out[k] = np.concatenate([arr, np.array(['RIGHT'] * n, dtype=arr.dtype)])
    elif arr.ndim >= 2:                       # features (N,10,78)
        out[k] = np.concatenate([arr, np.zeros((n,) + arr.shape[1:], dtype=arr.dtype)])
    else:                                     # per-sample floats
        out[k] = np.concatenate([arr, np.zeros(n, dtype=arr.dtype)])
lens = {k: len(v) for k, v in out.items()}
assert len(set(lens.values())) == 1, lens
np.savez_compressed('data/roboflow/artifacts/roboflow-v1-f16-bigtest-oss.npz', **out)
print('all arrays length:', set(lens.values()), '| splits:', dict(collections.Counter(out['splits'].tolist())))
print('SAVED roboflow-v1-f16-bigtest-oss.npz')
