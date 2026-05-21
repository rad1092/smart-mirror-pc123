from __future__ import annotations

import argparse
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULTS = {
    "USE_MEDIAPIPE_TASKS": "true",
    "POSE_PIPELINE_MODE": "dual",
    "POSE_MODEL_VARIANT": "full",
    "POSE_FAST_MODEL_VARIANT": "lite",
    "POSE_ACCURATE_MODEL_VARIANT": "full",
    "POSE_MODEL_PATH": "",
    "POSE_FAST_MODEL_PATH": "",
    "POSE_ACCURATE_MODEL_PATH": "",
    "MAX_POSES": "3",
    "EXERCISE_CLASSIFIER_PATH": "./models/exercise_classifier/exercise_classifier.json",
}


def read_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def load_settings(env_file: Path) -> dict[str, str]:
    settings = DEFAULTS.copy()
    example = PROJECT_ROOT / ".env.example"
    settings.update({key: value for key, value in read_env_file(example).items() if key in settings})
    settings.update({key: value for key, value in read_env_file(env_file).items() if key in settings})
    return settings


def resolve_model_path(value: str) -> Path:
    path = Path(value)
    if path.is_absolute():
        return path
    return PROJECT_ROOT / path


def pose_path_for_variant(variant: str) -> str:
    normalized = variant.strip().lower()
    if normalized == "full":
        return "./models/pose/pose_landmarker_full.task"
    return "./models/pose/pose_landmarker_lite.task"


def truthy(value: str) -> bool:
    return value.strip().lower() in {"1", "true", "yes", "on"}


def check_path(label: str, value: str) -> bool:
    if not value:
        print(f"[INFO] {label} model path not set; skipped")
        return False
    resolved = resolve_model_path(value)
    if resolved.exists():
        print(f"[OK] {label} model found: {resolved}")
        return True
    print(f"[WARN] {label} model missing: {resolved}")
    return False


def main() -> int:
    parser = argparse.ArgumentParser(description="Check local PC3 vision model paths.")
    parser.add_argument("--env-file", default=".env", help="Path to .env file relative to project root.")
    args = parser.parse_args()

    env_path = Path(args.env_file)
    if not env_path.is_absolute():
        env_path = PROJECT_ROOT / env_path

    settings = load_settings(env_path)
    use_tasks = truthy(settings["USE_MEDIAPIPE_TASKS"])
    print(f"Checking model paths using env file: {env_path}")
    print(f"USE_MEDIAPIPE_TASKS={str(use_tasks).lower()}")
    print(f"POSE_PIPELINE_MODE={settings['POSE_PIPELINE_MODE']}")
    print(f"POSE_MODEL_VARIANT={settings['POSE_MODEL_VARIANT']}")
    print(f"POSE_FAST_MODEL_VARIANT={settings['POSE_FAST_MODEL_VARIANT']}")
    print(f"POSE_ACCURATE_MODEL_VARIANT={settings['POSE_ACCURATE_MODEL_VARIANT']}")
    print(f"MAX_POSES={settings['MAX_POSES']}")

    pose_path = settings["POSE_MODEL_PATH"] or pose_path_for_variant(settings["POSE_MODEL_VARIANT"])
    fast_pose_path = settings["POSE_FAST_MODEL_PATH"] or pose_path_for_variant(settings["POSE_FAST_MODEL_VARIANT"])
    accurate_pose_path = settings["POSE_ACCURATE_MODEL_PATH"] or pose_path_for_variant(settings["POSE_ACCURATE_MODEL_VARIANT"])
    pose_ok = check_path("pose", pose_path)
    fast_ok = check_path("pose fast", fast_pose_path)
    accurate_ok = check_path("pose accurate", accurate_pose_path)
    check_path("pose lite asset", "./models/pose/pose_landmarker_lite.task")
    check_path("pose full asset", "./models/pose/pose_landmarker_full.task")
    check_path("exercise classifier", settings["EXERCISE_CLASSIFIER_PATH"])

    if use_tasks and not pose_ok:
        print("[WARN] USE_MEDIAPIPE_TASKS=true but pose model is missing.")
    if use_tasks and settings["POSE_PIPELINE_MODE"] == "dual" and not (fast_ok and accurate_ok):
        print("[WARN] POSE_PIPELINE_MODE=dual but fast or accurate pose model is missing.")
    print("[INFO] PC3 model path check complete")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
