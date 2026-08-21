# Roboflow Static Jamo — Cross-machine Handoff

## Reproduce the selected baseline

On a GPU machine, use the repository checkout and the raw dataset under `data/roboflow/sign-language-v1`. Keep physical GPU 2 exclusive:

```bash
cd /home/j-i15a405/sign_language_training
CUDA_VISIBLE_DEVICES=2 .venv/bin/python code-v3/scripts/train_roboflow_jamo_image_t10.py \
  --features data/roboflow/artifacts/roboflow-v1-f16.npz \
  --dataset-root data/roboflow/sign-language-v1 \
  --output-dir code-v3/outputs/t126-roboflow-v1-efficientnet \
  --attempt-id T-126 --architecture efficientnet_b0 --all-jamo-images \
  --epochs 24 --batch-size 128 --seed 53 \
  --baseline-accuracy 0.9441624365482234
```

## T-129 update

Class-focused 1.25x sampling held test accuracy at 94.4162% and reduced the below-93%-recall class count from 15 to 13 (`ㅏ`, `ㅡ` cleared). Macro F1 declined slightly to 93.4611%, so the class-floor improvement is retained as a trade-off rather than declared a universal win.

## T-130 update

Increasing focused sampling to 1.50x produced the strongest aggregate static result: test accuracy 95.4315% and macro F1 95.2429%. It did not reduce the 13-class recall-floor count, and the failing set changed; keep T-130 as the aggregate candidate while using pair-level confusion separation next.

## Current decision

T-130 is the selected aggregate static-image candidate: test accuracy 95.4315%, macro F1 95.2429%, and 13 below-target classes. T-133 (hard-negative margin 0.10) and T-134 (loss-only weighting) regressed, so do not repeat margin or sampler/loss weighting sweeps.

## Next valid unit of work

1. Read T-130, T-133, and T-134 `evaluation.json` plus `train.log` before running anything.
2. Make one data-diversity change targeting the persistent floor-miss classes (pose, camera angle, lighting, signer), not another sampler/loss/margin hyperparameter sweep.
3. Verify raw-image path, 31-class label order, and `CUDA_VISIBLE_DEVICES=2` before launch.
4. On completion, record test accuracy, macro F1, every below-93% recall class, and top confusions in `roboflow-static-experiment-log.md`.
5. Keep static Roboflow results separate from AIHub 103 landmark BiGRU-CTC continuous results. The current static split is not signer-independent.

## Required assets

- `data/roboflow/Sign Language.v1i.folder.zip` (source archive)
- `data/roboflow/sign-language-v1/` (extracted images)
- `data/roboflow/artifacts/roboflow-v1-f16.npz` and audit JSON
- `code-v3/scripts/train_roboflow_jamo_image_t10.py`
