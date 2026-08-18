# Microsoft Entra MFA Trust Research

## Sources consulted

1. Microsoft Entra SAML SSO protocol: https://learn.microsoft.com/en-us/entra/identity-platform/single-sign-on-saml-protocol
2. Microsoft Entra Conditional Access overview: https://learn.microsoft.com/en-us/entra/identity/conditional-access/overview

## Findings relevant to ReadyPackets

Microsoft documents that a signed Entra SAML response may contain the `http://schemas.microsoft.com/claims/authnmethodsreferences` attribute. The documented response example includes `http://schemas.microsoft.com/claims/multipleauthn` when the user completed multifactor authentication. The protocol reference also documents `AuthnContextClassRef` values that distinguish first-factor and stronger authentication methods, including `MobileTwoFactorContract` and `SmartcardPKI`.

Microsoft Conditional Access can target applications and require MFA, an authentication strength, compliant devices, and other identity/device/location signals. This supports a design in which Entra Conditional Access protects the ReadyPackets enterprise application before its signed assertion is accepted.

## Recommended implementation posture

Do not trust Entra MFA merely because the SAML issuer is Entra. A future ReadyPackets option should be disabled by default and permit local MFA bypass only when all of the following are true: the SAML signature, issuer, audience, recipient, and assertion timing are valid; the account is an administrator; the Entra application is configured with a targeted Conditional Access MFA or authentication-strength requirement; a configured signed SAML assurance indicator such as `multipleauthn` or an allowed `AuthnContextClassRef` is present; and the event is security-audited. The implementation needs a test/canary mode, a separate break-glass local administrator, typed activation confirmation, and a clear fallback to local MFA on any missing or malformed assurance claim.

This research is an assessment reference only; no Entra MFA trust option has been enabled or implemented during the SAML MFA access recovery incident.
