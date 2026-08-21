"""MediaPipe Hand Landmarker adapter for still images.""";

from dataclasses import dataclass;
from pathlib import Path;
from typing import Protocol;

import numpy as np;
from PIL import Image, ImageOps;

from .config import MediaPipeConfig;


PointList = list[list[float]];


@dataclass(frozen=True)
class ExtractedHand:
    handedness: str;
    handednessScore: float;
    landmarks: PointList;
    worldLandmarks: PointList;
    imageWidth: int;
    imageHeight: int;


class HandExtractor(Protocol):
    def extract(self, imagePath: Path) -> ExtractedHand | None:
        ...;

    def close(self) -> None:
        ...;


class MediaPipeHandExtractor:
    def __init__(self, modelPath: Path, config: MediaPipeConfig) -> None:
        if not modelPath.is_file():
            raise FileNotFoundError(f"MediaPipe model does not exist: {modelPath}");

        import mediapipe as mp;

        baseOptions = mp.tasks.BaseOptions(model_asset_path=str(modelPath));
        options = mp.tasks.vision.HandLandmarkerOptions(
            base_options=baseOptions,
            running_mode=mp.tasks.vision.RunningMode.IMAGE,
            num_hands=config.numHands,
            min_hand_detection_confidence=config.minHandDetectionConfidence,
            min_hand_presence_confidence=config.minHandPresenceConfidence,
            min_tracking_confidence=config.minTrackingConfidence,
        );
        self.mp = mp;
        self.landmarker = mp.tasks.vision.HandLandmarker.create_from_options(options);

    def extract(self, imagePath: Path) -> ExtractedHand | None:
        with Image.open(imagePath) as sourceImage:
            image = ImageOps.exif_transpose(sourceImage).convert("RGB");
            imageArray = np.ascontiguousarray(np.asarray(image));
            width, height = image.size;

        mediaPipeImage = self.mp.Image(image_format=self.mp.ImageFormat.SRGB, data=imageArray);
        result = self.landmarker.detect(mediaPipeImage);
        if not result.hand_landmarks:
            return None;

        category = result.handedness[0][0];
        return ExtractedHand(
            handedness=category.category_name,
            handednessScore=float(category.score),
            landmarks=_pointsToList(result.hand_landmarks[0]),
            worldLandmarks=_pointsToList(result.hand_world_landmarks[0]),
            imageWidth=width,
            imageHeight=height,
        );

    def close(self) -> None:
        self.landmarker.close();

    def __enter__(self) -> "MediaPipeHandExtractor":
        return self;

    def __exit__(self, exceptionType: object, exceptionValue: object, traceback: object) -> None:
        self.close();


def _pointsToList(points: object) -> PointList:
    return [[float(point.x), float(point.y), float(point.z)] for point in points];
