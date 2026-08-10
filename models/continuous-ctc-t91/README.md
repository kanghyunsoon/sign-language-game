# continuous-ctc-t91

Experimental continuous Korean fingerspelling checkpoint selected on AIHub 103 signer 18 validation. It is preserved for reproducible continuation on another PC and is **not** the deployed game model.

- labels: 31 Korean jamo + `NUM_0` through `NUM_9`
- input: normalized two-hand OpenPose features, 128 values per frame
- temporal features: raw frame + first difference
- model: packed 3-layer bidirectional GRU, hidden size 192
- training: coordinate noise std 0.01, inverse-frequency sampler alpha 0.50
- checkpoint selection: maximize validation `macroF1 - CER`
- final T-91 tuning: validation-low jamo and digits were weakly reweighted 1.5x for 1 selected epoch
- decoder used by T-92: greedy CTC with blank logit bias `-0.9`
- physical training device: GPU 2 (`CUDA_VISIBLE_DEVICES=2`)
- checkpoint SHA-256: `04A65A0F77958722A4BD3401AC1F91FEF0A99AB19DFD7A0BA2FA63FB612E98E7`

`evaluation.json` is the T-92 fixed evaluation of the T-91 checkpoint on signer 18 validation and signer 19 development. The development set was inspected repeatedly during this experiment and is not an untouched final certification set.

The AIHub source archives and compact NPZ features are not redistributed in Git. Recreate them with `prepare_aihub_sequence_manifest.py` and `pack_aihub_sequence_features.py`, or copy the licensed local data separately. Continue training with `game-ai-dev-server/scripts/train_aihub_sequence_ctc_t23.py` and pass:

```text
--initial-checkpoint models/continuous-ctc-t91/best.pt
--use-delta-features --gru-hidden-size 192 --gru-layers 3
```

The measured macro-F1 is below 93%, 17 classes miss the recall/F1 gate, and `ㅒ` has zero train/evaluation support. Do not promote this checkpoint to production until a new signer-held-out final set and the condition tests in `model-evaluation.md` pass.
