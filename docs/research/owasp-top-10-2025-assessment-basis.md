# OWASP Top 10 2025 — Assessment Basis

## Sources

1. [OWASP Top 10:2025](https://owasp.org/Top10/2025/en/)
2. [A01:2025 Broken Access Control](https://owasp.org/Top10/2025/A01_2025-Broken_Access_Control/)
3. [A02:2025 Security Misconfiguration](https://owasp.org/Top10/2025/A02_2025-Security_Misconfiguration/)
4. [A03:2025 Software Supply Chain Failures](https://owasp.org/Top10/2025/A03_2025-Software_Supply_Chain_Failures/)

## Official 2025 categories

| ID | Category |
|---|---|
| A01 | Broken Access Control |
| A02 | Security Misconfiguration |
| A03 | Software Supply Chain Failures |
| A04 | Cryptographic Failures |
| A05 | Injection |
| A06 | Insecure Design |
| A07 | Authentication Failures |
| A08 | Software or Data Integrity Failures |
| A09 | Security Logging and Alerting Failures |
| A10 | Mishandling of Exceptional Conditions |

## Assessment implications

OWASP describes the Top 10 as an awareness standard, not a certification. The ReadyPackets assessment must therefore distinguish implemented controls and evidence from residual risk and unperformed assurance work. Relevant official guidance requires server-side deny-by-default authorization and record ownership enforcement, minimal CORS, testable hardening and secure error behavior, dependency/SBOM and update management, trusted software sources, staged releases, and ongoing change/patch management.

The user-facing conclusion must not claim that any application is invulnerable or “OWASP certified.” It should state that ReadyPackets has substantial implemented controls and identify outstanding assurance items, notably regular dependency scanning/SBOM generation, authenticated authorization regression testing, third-party configuration/restore drills, and independent penetration or accessibility testing.
