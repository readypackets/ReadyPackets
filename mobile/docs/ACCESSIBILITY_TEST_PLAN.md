# Native Accessibility Test Plan

ReadyPackets uses native controls, semantic labels, Dynamic Type/font-scale aware layouts, non-colour status indicators, visible focus, and a minimum 44-point / 48-dp interactive target baseline. **System appearance** is the initial default and contrast must be checked in both light and dark appearances.

| Journey | iOS evidence | Android evidence |
|---|---|---|
| Sign-in and MFA | VoiceOver rotor, Dynamic Type XXXL, keyboard focus, content-size clipping | TalkBack traversal, font scale 200%, keyboard navigation |
| Home and orders | Labels announce status plus text, not colour alone; reduced motion progress | Semantics describe progress/action state; large-screen adaptive layout |
| File/audio permissions | Just-in-time explanation, denied microphone/photo recovery, recording state announced | Runtime denial does not block other work; settings alternative is usable |
| Messages and notifications | Generic notifications, focus after deep link, server reauthorization failure state | Generic push, app-link landing, denied-notification recovery |
| Profile and deletion | Confirmation language and destructive action label communicate consequences | Equivalent TalkBack, focus order, and cancellation path |

Physical-device testing with current supported iOS and Android releases is mandatory before release. Automated unit/UI tests complement but do not replace these walkthroughs.
