# PC3 Exercise Pose Model

PC3 is exercise-only. The runtime uses MediaPipe Pose Landmarker models for pose landmark detection:

```text
models/pose/pose_landmarker_lite.task
models/pose/pose_landmarker_full.task
```

These pose models are committed to the repository because PC3 needs them to run real exercise analysis after a fresh clone. The default runtime uses a dual pipeline: Lite for fast target tracking and Full for accurate posture/count validation.

Other model and weight formats remain ignored by `models/.gitignore` unless they are explicitly allowed. The removed face and segmentation features do not require model files.

## Runtime Settings

```env
USE_MEDIAPIPE_TASKS=true
POSE_PIPELINE_MODE=dual
POSE_MODEL_VARIANT=full
POSE_FAST_MODEL_VARIANT=lite
POSE_ACCURATE_MODEL_VARIANT=full
POSE_ACCURATE_INTERVAL=1
MAX_POSES=3
MIN_VALID_FRAME_RATIO=0.55
MAX_MODEL_DISAGREEMENT_RATIO=0.30
```

Check the local model path with:

```bash
python scripts/check_model_paths.py
```
