# Roboflow Static Jamo Experiments

## Scope and evaluation rule

- Dataset: Roboflow `Sign Language v1` image dataset, extracted to MediaPipe landmark audit data and retained as raw images for static-image transfer learning.
- This log is for static jamo-image experiments only. Its random/augmented split is not signer-independent and it must not be reported as continuous fingerspelling, CTC, or service production performance.
- Selection rule: every supported class must reach 93% recall; aggregate accuracy and macro F1 are supporting metrics only.
- Training device: physical GPU 2 (`CUDA_VISIBLE_DEVICES=2`), NVIDIA L40S; PyTorch logical device `cuda:0`.

## T-126 — EfficientNet-B0 transfer baseline

**Purpose.** Test whether direct image features recover static hand-shape information lost by landmark-only MLP.

**Measured test result.** Accuracy **94.4162%**, macro F1 **93.5522%**; validation accuracy 94.7236%.

**Class-floor result.** The 93% recall gate did not pass. Fifteen classes were below target: `ㄹ, ㅈ, ㅊ, ㅋ, ㅏ, ㅑ, ㅒ, ㅓ, ㅔ, ㅗ, ㅛ, ㅟ, ㅠ, ㅡ, ㅢ`. Minimum recall was 66.67%.

**Decision.** Retain as the static-image baseline. It materially outperformed the landmark MLP test result (68.95%), but is not a continuous/signer-independent deployment candidate.

## T-127 — label smoothing 0.00

**Single changed variable.** Label smoothing: baseline 0.04 → 0.00.

**Measured test result.** Accuracy **90.86%**, macro F1 **90.25%**, **23** classes below the 93% recall floor.

**Decision.** Not selected. Removing smoothing regressed both aggregate performance and the per-class floor; retain it as evidence that this dataset needs regularization, not as a production candidate.

## T-128 — label smoothing 0.02

**Single changed variable.** Label smoothing: baseline 0.04 → 0.02.

**Measured test result.** Accuracy **93.9086%** (−0.5076 percentage points vs T-126), macro F1 **93.0941%**.

**Decision.** Not selected. Halving smoothing did not beat T-126. Further smoothing-only sweeps are stopped. The next improvement path is class-targeted data diversity/augmentation for the T-126 floor-miss classes, with signer/condition-separated validation before any service claim.

## T-129 — class-floor focused sampling (1.25x)

**Single changed policy.** The T-126 baseline training/split/model settings were retained; the 15 below-floor classes were sampled/weighted at 1.25x.

**Measured test result.** Accuracy **94.4162%** (unchanged from T-126), macro F1 **93.4611%** (−0.0911 percentage points vs T-126).

**Class-floor result.** Below-93% recall classes decreased from **15 to 13**. `ㅏ` and `ㅡ` cleared the floor. Remaining below-floor classes: `ㄹ, ㅈ, ㅊ, ㅋ, ㅑ, ㅒ, ㅓ, ㅔ, ㅗ, ㅛ, ㅟ, ㅠ, ㅢ`.

**Decision.** Retain as evidence that class-focused sampling can improve the class floor even when macro F1 does not. Next experiment changes only focus strength from 1.25x to 1.50x; it will be rejected if the floor regresses or aggregate quality falls materially.

## T-130 — class-floor focused sampling (1.50x)

**Single changed policy.** T-129 was retained and only the focus multiplier changed from 1.25x to 1.50x.

**Measured test result.** Accuracy **95.4315%** (+1.0152 percentage points vs T-126), macro F1 **95.2429%** (+1.6906 points vs T-126).

**Class-floor result.** The below-93% recall count remained **13**. The below-floor set changed to `ㄱ, ㄹ, ㅈ, ㅊ, ㅋ, ㅌ, ㅏ, ㅔ, ㅕ, ㅗ, ㅛ, ㅠ, ㅢ`; therefore the higher focus strength improves aggregate discrimination but does not solve the per-class floor.

**Decision.** Retain T-130 for the strongest aggregate static-image score, but do not claim the class-floor target is met. The next unit must target actual top-confusion pairs; it must keep the T-130 multiplier and change only the hard-negative/confusion-separation policy.

## T-131 — pair-level confusion separation (running)

**Hypothesis.** T-130 leaves a 13-class floor miss despite higher aggregate quality because a small set of visually similar static jamo pairs remains confused. Keep the 1.50x focus policy and add only hard-negative pair separation for `ㄱ:ㅈ|ㄹ:ㅌ|ㅊ:ㅋ|ㅏ:ㅓ|ㅕ:ㅛ|ㅗ:ㅢ|ㅡ:ㅢ`.

**Execution.** Physical GPU 2 only (`CUDA_VISIBLE_DEVICES=2`); output `/home/j-i15a405/sign_language_training/code-v3/outputs/t131-roboflow-v1-confusion-pairs/`.

**Completion rule.** Compare actual test accuracy, macro F1, all below-93% classes, and those seven directed confusion pairs against T-130. Do not select it from aggregate metrics alone.

## T-131 — confusion-pair configuration check

**Measured result.** Test accuracy **95.4315%**, macro F1 **95.2429%**, 13 below-floor classes — exactly equal to T-130.

**Root cause.** The report records `confusionSeparationPolicy.enabled=false`, `source=previous-validation`, no selected pairs, margin 0 and loss weight 0. The manually supplied pairs were not activated because the policy source was left at its default; this was a configuration check, not evidence against pair-level separation.

**Decision.** Do not treat T-131 as a negative model result. T-132 retains every T-130 setting and explicitly uses the `predefined-domain` confusion source so the same inspected pairs are applied.

## T-132 — predefined confusion-pair separation (running)

**Single corrected change.** Keep T-130 unchanged and activate the inspected hard-negative pairs with `--confusion-source predefined-domain`: `ㄱ:ㅈ|ㄹ:ㅌ|ㅊ:ㅋ|ㅏ:ㅓ|ㅕ:ㅛ|ㅗ:ㅢ|ㅡ:ㅢ`.

**Execution verification.** Physical GPU 2 only, active process started successfully; output `/home/j-i15a405/sign_language_training/code-v3/outputs/t132-roboflow-v1-confusion-predefined/`.

**Completion rule.** Verify that the report records an enabled nonzero confusion-separation policy before judging metrics. Select only if the class floor improves without an unacceptable aggregate regression.

## T-132 — predefined confusion source, zero margin

**Problem checked.** T-131 did not enable manual pairs because it used the wrong source. T-132 corrected only the source to `predefined-domain`.

**Technique and verification.** The report confirms the seven pairs were loaded and `source=predefined-domain`; however, its separation margin remained **0.0**. With zero required logit margin, the pair policy did not impose a separating constraint.

**Measured result.** Test accuracy **95.4315%**, macro F1 **95.2429%**, and **13** below-floor classes — unchanged from T-130.

**Decision.** This is a configuration verification case, not an ineffective-pair conclusion. T-133 retains the exact T-132 configuration and changes only `confusion-margin` from 0.0 to a nonzero 0.10.

## T-133 — predefined confusion pairs with 0.10 margin (running)

**Problem.** T-132 loaded the intended pairs but its zero margin could not force separation.

**Single changed technique.** Keep every T-132 condition and change only `confusion-margin: 0.00 → 0.10`; the predefined pairs and default configured pair-loss weight remain intact.

**Execution.** Physical GPU 2 only. Output `/home/j-i15a405/sign_language_training/code-v3/outputs/t133-roboflow-v1-confusion-margin010/`.

**Evaluation.** On completion, compare all supported-class recalls and each directed pair count with T-130/T-132; document aggregate change separately from class-floor change.

## Handoff

Remote outputs:

- `/home/j-i15a405/sign_language_training/code-v3/outputs/t126-roboflow-v1-efficientnet/`
- `/home/j-i15a405/sign_language_training/code-v3/outputs/t127-roboflow-v1-efficientnet-nosmooth/`
- `/home/j-i15a405/sign_language_training/code-v3/outputs/t128-roboflow-v1-efficientnet-smooth02/`

Do not merge these static records into the AIHub 103 BiGRU-CTC result table. They answer a different static-image question.
