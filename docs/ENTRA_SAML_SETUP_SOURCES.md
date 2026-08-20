# Microsoft Entra SAML setup sources

Prepared 2026-08-20 for the ReadyPackets administrator setup guide.

## Official Microsoft guidance consulted

1. [Enable SAML single sign-on for an enterprise application](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/add-application-portal-setup-sso)
   - Configure the enterprise application’s Basic SAML Configuration using the service provider’s Identifier/Entity ID and Reply URL/ACS URL.
   - Record the Entra Login URL, Microsoft Entra Identifier, and download the raw SAML signing certificate to configure the service provider.
   - Assign intended test users/groups and use the Entra Test feature before broad rollout.

2. [Single sign-on SAML protocol](https://learn.microsoft.com/en-us/entra/identity-platform/single-sign-on-saml-protocol)
   - Entra supports SAML 2.0 HTTP Redirect binding for the authentication request and HTTP POST for the response.
   - The service provider issuer/audience must match the configured Entra application identifier.
   - Entra responses include the authnmethodsreferences claim with the MFA marker `http://schemas.microsoft.com/claims/multipleauthn` when applicable.

3. [Satisfy Microsoft Entra MFA controls with MFA claims from a federated IdP](https://learn.microsoft.com/en-us/entra/identity/authentication/how-to-mfa-expected-inbound-assertions)
   - For SAML 2.0 federation, MFA evidence is carried in the `AuthnContext` of an `AuthnStatement` and uses `http://schemas.microsoft.com/claims/multipleauthn` as the relevant marker.

4. [Require multifactor authentication for all users](https://learn.microsoft.com/en-us/entra/identity/conditional-access/policy-all-users-mfa-strength)
   - Start Conditional Access policies in Report-only mode before turning them on.
   - Maintain emergency/break-glass exclusions to prevent tenant lockout.
   - MFA, passwordless MFA, and phishing-resistant built-in authentication strengths are available.

## ReadyPackets mapping

ReadyPackets is a SAML service provider, not an OIDC application registration. Its administrator SAML settings require:

- ACS/Reply URL: `{portal URL}/api/saml/acs`
- Service provider metadata: `{portal URL}/api/saml/metadata`
- Entra Login URL -> **Sign-in URL (entry point)**
- Entra Identifier -> **Issuer (entity ID)**
- Entra raw Base64 signing certificate -> **Identity provider certificate**
- Default MFA assurance settings: claim name `http://schemas.microsoft.com/claims/authnmethodsreferences`; required value `http://schemas.microsoft.com/claims/multipleauthn`.

Do not use an Entra application client secret for this SAML configuration.

