# -*- coding: utf-8 -*-
"""랜드마크 -> 모델 입력 특징 변환. 학습(GPU)과 추론(CPU)에서 동일하게 사용한다.

수어 4요소를 명시적으로 인코딩:
  수형 = 손목 기준 상대 좌표 21점 (손 크기 정규화)
  수향 = 손바닥 법선 벡터 + 손가락 방향 벡터
  수위 = 어깨 중심 기준 손목 위치 (어깨 너비 정규화)
  수동 = 위 특징들의 프레임 간 차분 (delta)

정적 특징 150차원 (손당 73 = 수형 63 + 수위 3 + 수향 6 + valid 1, 손 간 관계 4)
+ delta 150 = 300차원.
손 간 관계(4): 손목 간 상대 벡터(어깨 너비 정규화) + 거리 — 양손 접촉/간격이
의미를 가르는 단어(ship 등)를 위해 명시적으로 인코딩 (feature v3에서 추가).
"""
import numpy as np

L_SHO, R_SHO = 11, 12
WRIST, IDX_MCP, MID_MCP, PKY_MCP = 0, 5, 9, 17
EPS = 1e-6

STATIC_DIM = 150
FEAT_DIM = 300
SEQ_LEN = 48
FEATURE_VERSION = "handword-feature-v3"


def interpolate_missing(arr, valid):
    """(T, K, C) 배열의 valid=False 프레임을 시간축 선형 보간으로 채운다."""
    T = arr.shape[0]
    idx = np.where(valid)[0]
    if len(idx) == 0 or len(idx) == T:
        return arr
    flat = arr.reshape(T, -1)
    out = np.empty_like(flat)
    xs = np.arange(T)
    for j in range(flat.shape[1]):
        out[:, j] = np.interp(xs, idx, flat[idx, j])
    return out.reshape(arr.shape)


def _hand_features(hand, sho, width):
    """(T,21,3) 손 랜드마크 -> (T,72) [수형 63 | 수위 3 | 수향 6]"""
    T = hand.shape[0]
    wrist = hand[:, WRIST]
    # 수위: 어깨 중심 기준, 어깨 너비로 정규화
    loc = np.concatenate([(wrist[:, :2] - sho) / width[:, None], wrist[:, 2:3]], axis=1)
    # 수형: 손목 기준 상대 좌표, 손 크기(손목-중지MCP)로 정규화
    scale = np.linalg.norm(hand[:, MID_MCP] - wrist, axis=1)[:, None, None] + EPS
    shape = ((hand - wrist[:, None, :]) / scale).reshape(T, -1)
    # 수향: 손바닥 평면 법선 + 손가락 방향
    v1 = hand[:, IDX_MCP] - wrist
    v2 = hand[:, PKY_MCP] - wrist
    normal = np.cross(v1, v2)
    normal /= np.linalg.norm(normal, axis=1, keepdims=True) + EPS
    direction = hand[:, MID_MCP] - wrist
    direction /= np.linalg.norm(direction, axis=1, keepdims=True) + EPS
    return np.concatenate([shape, loc, normal, direction], axis=1).astype(np.float32)


def clip_features(pose, lh, rh, pose_valid, lh_valid, rh_valid):
    """raw 랜드마크 -> (T, 292) 특징. 미검출 프레임은 보간하되 valid 플래그로 표시."""
    T = pose.shape[0]
    pose = interpolate_missing(pose[..., :3], pose_valid.astype(bool))
    lh = interpolate_missing(lh, lh_valid.astype(bool))
    rh = interpolate_missing(rh, rh_valid.astype(bool))

    if pose_valid.any():
        sho = (pose[:, L_SHO, :2] + pose[:, R_SHO, :2]) / 2
        width = np.linalg.norm(pose[:, L_SHO, :2] - pose[:, R_SHO, :2], axis=1) + EPS
    else:  # 포즈가 전혀 없으면 화면 중심 기준
        sho = np.full((T, 2), 0.5, np.float32)
        width = np.full(T, 0.3, np.float32)

    feats = []
    for hand, valid in ((lh, lh_valid), (rh, rh_valid)):
        if valid.any():
            hf = _hand_features(hand, sho, width)  # 미검출 프레임은 보간값 사용, valid 플래그로 구분
        else:
            hf = np.zeros((T, 72), np.float32)  # 클립 내내 미검출인 손
        feats.append(np.concatenate([hf, valid.astype(np.float32)[:, None]], axis=1))

    # 손 간 관계: 손목 간 상대 벡터(어깨 너비 정규화) + 거리. 한쪽이 클립 내내 미검출이면 0
    if lh_valid.any() and rh_valid.any():
        inter = (rh[:, WRIST] - lh[:, WRIST]).astype(np.float32)
        inter[:, :2] /= width[:, None]
        dist = np.linalg.norm(inter[:, :2], axis=1, keepdims=True).astype(np.float32)
        feats.append(np.concatenate([inter, dist], axis=1))
    else:
        feats.append(np.zeros((T, 4), np.float32))
    static = np.concatenate(feats, axis=1)  # (T, 150)

    delta = np.diff(static, axis=0, prepend=static[:1])  # 수동
    return np.concatenate([static, delta], axis=1)  # (T, 300)


def sample_frames(feats, seq_len=SEQ_LEN):
    """(T, D) -> (seq_len, D) 균일 샘플링 (짧으면 프레임 반복)."""
    T = feats.shape[0]
    idx = np.linspace(0, T - 1, seq_len).round().astype(int)
    return feats[idx]
