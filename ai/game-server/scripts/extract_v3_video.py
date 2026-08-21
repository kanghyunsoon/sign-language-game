"""T-150 자모 촬영 영상 → feature_v3(78값) 시퀀스 추출.

실행 환경: GPU 학습 서버. mediapipe/opencv 전용 venv에서 실행한다(TF와 protobuf가 충돌).
    LD_LIBRARY_PATH=$HOME/gllibs ~/mpvenv/bin/python code-v3/scripts/extract_v3_video.py

준비:
- ``output_video/<자모>/<자모>_1.avi`` (자모 31개 촬영 영상)
- ``code-v3/hand_landmarker.task`` (MediaPipe Hand Landmarker)
- 헤드리스 서버에는 libGLESv2.so.2가 없어 mediapipe가 로드에 실패한다. 다음처럼 링크해두고
  LD_LIBRARY_PATH로 지정한다:
      mkdir -p ~/gllibs
      ln -sf /usr/lib/x86_64-linux-gnu/libGLESv2_nvidia.so.2 ~/gllibs/libGLESv2.so.2
      ln -sf /usr/lib/x86_64-linux-gnu/libGL.so.1 ~/gllibs/libGL.so.1

기존 ``dataset/seq_*.npy``는 feature_v2(55값)로 이미 가공돼 방향/깊이를 복원할 수 없으므로,
영상에서 랜드마크(x,y,z)를 다시 뽑아 feature_v3를 계산한다. 프레임 창 10, stride 2로 시퀀스를
만들고 영상 앞 70%를 train, 뒤 30%를 test로 나눈다(같은 영상 분할이라 signer-independent 아님).

산출물: ``data/v3_video_seq.npz`` (X[N,10,78], Y, SP)
"""
import os, glob
import cv2  # preload GL libs before mediapipe
os.environ.setdefault('GLOG_minloglevel', '2')
import numpy as np
import imageio.v2 as imageio
import mediapipe as mp
from mediapipe.tasks import python as mpp
from mediapipe.tasks.python import vision

LM = 'code-v3/hand_landmarker.task'
JAMO = ["ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
        "ㅏ", "ㅑ", "ㅓ", "ㅕ", "ㅗ", "ㅛ", "ㅜ", "ㅠ", "ㅡ", "ㅣ", "ㅐ", "ㅒ", "ㅔ", "ㅖ", "ㅢ", "ㅚ", "ㅟ"]
IDX = {l: i for i, l in enumerate(JAMO)}
P = np.array((0, 1, 2, 3, 0, 5, 6, 7, 0, 9, 10, 11, 0, 13, 14, 15, 0, 17, 18, 19))
C = np.array((1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20))
AA = np.array((0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14, 16, 17, 18))
AB = np.array((1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15, 17, 18, 19))


def unit(v):
    n = float(np.linalg.norm(v))
    return v / n if n > 1e-6 else np.zeros_like(v)


def fv3(lms, hand):
    """app/feature_v3.landmarks_to_feature 와 동일한 78값 계약."""
    pts = np.array([(l.x, l.y, l.z) for l in lms], dtype=np.float32)
    if hand == 'LEFT':
        pts[:, 0] = 1.0 - pts[:, 0]
    wrist = pts[0].copy()
    ps = float(np.mean(np.linalg.norm(pts[[5, 9, 13, 17]] - wrist, axis=1)))
    if ps <= 1e-6:
        return None
    pts = (pts - wrist) / ps
    vec = pts[C] - pts[P]
    dirs = np.array([unit(v) for v in vec], dtype=np.float32)
    cos = np.einsum('nt,nt->n', dirs[AA], dirs[AB])
    ang = np.degrees(np.arccos(np.clip(cos, -1, 1))).astype(np.float32)
    pn = unit(np.cross(pts[5] - pts[0], pts[17] - pts[0])).astype(np.float32)
    return np.concatenate((dirs.reshape(-1), ang, pn)).astype(np.float32)


opts = vision.HandLandmarkerOptions(
    base_options=mpp.BaseOptions(model_asset_path=LM),
    running_mode=vision.RunningMode.IMAGE,
    num_hands=1,
    min_hand_detection_confidence=0.25,
    min_hand_presence_confidence=0.25,
)
X = []
Y = []
SP = []
with vision.HandLandmarker.create_from_options(opts) as lmk:
    for jamo in JAMO:
        vids = glob.glob(jamo + '/*.avi')
        if not vids:
            print('NO VID', jamo, flush=True)
            continue
        feats = []
        try:
            rd = imageio.get_reader(vids[0])
        except Exception as error:
            print('READFAIL', jamo, str(error)[:80], flush=True)
            continue
        for fr in rd:
            rgb = np.asarray(fr)[:, :, :3].astype('uint8')
            r = lmk.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb))
            if not r.hand_landmarks or not r.handedness:
                continue
            f = fv3(r.hand_landmarks[0], r.handedness[0][0].category_name.upper())
            if f is not None:
                feats.append(f)
        rd.close()
        n = len(feats)
        if n < 12:
            print('FEW', jamo, n, flush=True)
            continue
        cut = int(n * 0.7)
        for i in range(0, cut - 10, 2):
            X.append(np.stack(feats[i:i + 10])); Y.append(IDX[jamo]); SP.append('train')
        for i in range(cut, n - 10, 2):
            X.append(np.stack(feats[i:i + 10])); Y.append(IDX[jamo]); SP.append('test')
        print(jamo, 'frames', n, flush=True)

X = np.asarray(X, dtype=np.float32)
Y = np.asarray(Y)
SP = np.asarray(SP)
np.savez_compressed('data/v3_video_seq.npz', X=X, Y=Y, SP=SP)
import collections
print('SAVED v3_video_seq', X.shape, dict(collections.Counter(SP.tolist())), flush=True)
