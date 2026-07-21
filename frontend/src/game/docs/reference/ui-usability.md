# UI And Usability Unit

## Scope

This unit changes presentation, responsive layout, state messages, and accessibility cues only. It does not add game rules, retrain a model, or alter model preprocessing.

## Error Presentation

- Camera errors distinguish unavailable hardware, permission denial, MediaPipe initialization failure, and unknown startup errors.
- Python recognition errors distinguish server unavailability, model-load failures, invalid protocol messages, and unknown errors.
- Template absence remains a textual neutral feedback state; no reference pose is fabricated.

## Accessibility

Connection states retain their text labels. Recognition outcomes and hand-release guidance include text, and errors include an alert icon. The feedback UI retains finger-specific text guidance for non-correct bones. The Recognition Lab event log is an optional debug panel rather than persistent operational noise.
