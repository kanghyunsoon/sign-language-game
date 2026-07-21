# Solo Score And Learning Statistics Unit

## Configuration

`ScoringConfig` owns normal removal score, combo increment, incorrect-combo policy, and the no-target penalty. Its default no-target penalty is zero.

`RecognitionGameConfig.minimumConfidence` defaults to `0.8`. Confirmed events below the threshold are ignored before they can remove a letter, change score/combo, or affect statistics.

## Statistics

`LearningStatistics` stores only aggregate counters per active target symbol:

- target count
- confirmed count
- correct and incorrect count
- average confirmed confidence
- derived success rate

It does not retain landmarks, video frames, images, or raw prediction history.

## Score Timing

Score and removal count change after the existing removal highlight finishes and the Matter body is actually removed. An incorrect AI confirmation updates only the configured combo policy. A correct confirmation with no matching body records no default penalty.
