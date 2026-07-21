# Reference Template Capture

`TemplateCapturePage` records only user-provided MediaPipe landmark frames. It does not create or infer a hand pose.

## Capture quality

* Capture uses known `LEFT` or `RIGHT` handedness only and locks the first accepted hand for that session.
* Each accepted frame has exactly 21 finite landmarks and is normalized before storage.
* Frames are sampled at most every 100 ms so a burst of near-identical tracker frames does not dominate the template.
* At least 20 accepted frames are required before a template is created.

## Representative landmarks

The template uses the coordinate-wise median of all accepted normalized samples. Median aggregation reduces the effect of momentary MediaPipe tracking jitter and outliers while remaining deterministic and easy to validate on JSON import. It is not a claim that the resulting pose is anatomically correct.

Human review is required: the system cannot determine whether the person performed the intended Korean finger-spelling symbol correctly. Review the camera skeleton, target symbol, handedness, and captured frame count before exporting.

## JSON schema

One exported file contains one template with `version`, `symbol`, `handedness`, `feedbackMode`, `sampleCount`, `createdAt`, 21 normalized `landmarks`, and `normalizationVersion`.

`STATIC_TEMPLATE` permits a later landmark-comparison unit to use the template. `CLASSIFICATION_ONLY` preserves the capture but indicates that static joint comparison is inappropriate for that symbol.
