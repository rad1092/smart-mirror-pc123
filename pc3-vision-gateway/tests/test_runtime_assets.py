from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from app.config import Settings


def test_docs_and_model_asset_placeholders_exist():
    expected = [
        Path("models/README.md"),
        Path("models/.gitignore"),
        Path("models/pose/.gitkeep"),
        Path("models/pose/pose_landmarker_lite.task"),
        Path("models/pose/pose_landmarker_full.task"),
        Path("models/exercise_classifier/exercise_classifier.json"),
        Path("docs/exercise_knowledge_example.md"),
    ]

    for path in expected:
        assert path.exists(), f"missing {path}"


def test_model_gitignore_blocks_common_weight_formats():
    content = Path("models/.gitignore").read_text(encoding="utf-8")

    for pattern in ["*.task", "*.tflite", "*.onnx", "*.pt", "*.pth", "*.bin", "*.safetensors"]:
        assert pattern in content
    assert "!pose/pose_landmarker_lite.task" in content
    assert "!pose/pose_landmarker_full.task" in content


def test_pose_model_variant_selects_full_model_without_path_override():
    settings = Settings(_env_file=None, pose_model_variant="full", pose_model_path=None)

    assert settings.selected_pose_model_path.name == "pose_landmarker_full.task"


def test_pose_pipeline_defaults_to_dual_lite_fast_full_accurate():
    settings = Settings(_env_file=None)

    assert settings.pose_pipeline_mode == "dual"
    assert settings.pose_model_variant == "full"
    assert settings.selected_fast_pose_model_path.name == "pose_landmarker_lite.task"
    assert settings.selected_accurate_pose_model_path.name == "pose_landmarker_full.task"


def test_check_model_paths_script_succeeds_without_models():
    result = subprocess.run(
        [sys.executable, "scripts/check_model_paths.py"],
        cwd=Path.cwd(),
        text=True,
        capture_output=True,
        check=False,
    )

    assert result.returncode == 0
    assert "PC3 model path check complete" in result.stdout
