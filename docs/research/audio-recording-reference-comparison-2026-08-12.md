# Audio Recording Reference Comparison — 2026-08-12

## Scope

This comparison reviews the user-authorized private reference mirror at `readypackets/readypackets-audio-reference` (mirrored from `Manus-MadaSitoEnterprises-RP/readypackets`) against the ReadyPackets customer Phase I Business Pitch recording implementation. The review is limited to browser microphone capture, recording behavior, and related user feedback.

## Findings

| Concern | Reference implementation | ReadyPackets implementation | Operational implication |
|---|---|---|---|
| Microphone request | `navigator.mediaDevices.getUserMedia({ audio: true })` | Requests audio with `echoCancellation: true` and `noiseSuppression: true` | Both request microphone access. ReadyPackets additionally requests common voice-quality constraints; neither can override browser or operating-system permission. |
| Format selection | Selects `audio/webm` where supported, otherwise requests `audio/mp4` | Requires a WebM-compatible recording path for platform consistency | The reference accepts a wider browser-format range. ReadyPackets intentionally standardizes pitch uploads as WebM. |
| Recorder slices | `MediaRecorder.start(100)` emits periodic 100 ms chunks | Uses the recorder default buffering behavior | Both collect chunks locally until recording stops; this difference does not change microphone permission success. |
| Local preview | Creates an object URL and permits playback/discard before submission | Uploads the completed recording after stop | The reference offers a review step, while ReadyPackets prioritizes a simpler submit-to-order workflow. This review did not add a preview because the approved scope is preflight diagnostics only. |
| Error feedback | A single generic microphone-denied message | Differentiates permission, unavailable device, unsupported recording, and general failures | ReadyPackets gives more actionable failure guidance. |
| Preflight diagnostic | None | Being added, configurable from administrator Intake controls | ReadyPackets will test browser support, requested microphone permission, live input availability, and WebM recording support before the customer starts a pitch. |

## Conclusion

The reference implementation is simpler and more format-tolerant, but it does not provide a diagnostic preflight or more reliable permission outcome. The ReadyPackets microphone issue cannot be solved by changing `audio: true` versus an audio constraint object: both rely on the same browser and operating-system permission path. The approved ReadyPackets enhancement is therefore a configurable preflight diagnostic only. No customer audio upload fallback, written fallback, staff-assisted fallback, format-policy change, or playback/review step is included in this release.

## Reference files reviewed

- `client/src/pages/portal/OrderDetail.tsx`, lines 181–245 in `readypackets/readypackets-audio-reference`
- `client/src/pages/portal/Intake.tsx` in the ReadyPackets production source

## Private repository reference

- https://github.com/readypackets/readypackets-audio-reference
