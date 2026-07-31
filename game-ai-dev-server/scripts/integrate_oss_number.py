"""T-148 OSS Number 신규-signer 지숫자 데이터 통합.

실행 환경: GPU 학습 서버 ``~/sign_language_training`` (venv python).
    python code-v3/scripts/integrate_oss_number.py

Roboflow Universe ``oss-4tnzy/number-c08aw``(CC BY 4.0, 93장, 다른 signer, digit 2~10)를
Pascal VOC로 받아 ``data/roboflow/oss-number/extracted``에 풀어둔 뒤 실행한다.
각 이미지의 클래스를 KSL 숫자 폴더 규약에 매핑(OSS "2"~"9"→ksl "2"~"9", "10"→"10-1",
'hand-numbers' 스킵)해 ``data/ksl-numbers/{train,test}`` 에 복사한다.
(트레이너 라벨: 폴더 "1"~"9"→NUM_1~9, "10-1"/"10-2"→NUM_0.)

이후 train_roboflow_jamo_image_t10.py 를 --number-root data/ksl-numbers 로 재학습하면
숫자 도메인에 신규-signer 데이터가 반영된다(T-148: 이미지 숫자 93.3%→96.5%).

경로는 학습 서버의 code-v3 워크스페이스 기준 상대경로다.
"""
import os, glob, shutil, collections
import xml.etree.ElementTree as ET

KSL = 'data/ksl-numbers'
OSS = 'data/roboflow/oss-number/extracted'


def kslfolder(name):
    if name == '10':
        return '10-1'
    if name in {'2', '3', '4', '5', '6', '7', '8', '9'}:
        return name
    return None  # skip 'hand-numbers', etc.


n = 0
skip = collections.Counter()
for osp in ['train', 'valid', 'test']:
    split = 'test' if osp == 'test' else 'train'
    for xmlf in sorted(glob.glob(f'{OSS}/{osp}/*.xml')):
        root = ET.parse(xmlf).getroot()
        obj = root.find('object')
        if obj is None:
            skip['NO_OBJ'] += 1; continue
        name = obj.find('name').text.strip()
        f = kslfolder(name)
        if f is None:
            skip[name] += 1; continue
        jpg = xmlf[:-4] + '.jpg'
        if not os.path.exists(jpg):
            skip['NO_JPG'] += 1; continue
        dst = os.path.join(KSL, split, f); os.makedirs(dst, exist_ok=True)
        shutil.copy(jpg, os.path.join(dst, 'OSSNUM_' + os.path.basename(jpg))); n += 1
print('copied', n, '| skip', dict(skip))
for split in ['train', 'test']:
    c = {f: len(glob.glob(f'{KSL}/{split}/{f}/*')) for f in sorted(os.listdir(f'{KSL}/{split}'))}
    print(split, c)
