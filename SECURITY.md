# Security Policy

## Supported versions

DockDash is currently maintained on the latest release line. Security fixes are applied to the latest release and to `master`; older releases may not receive backports.

| Version        | Supported             |
| -------------- | --------------------- |
| Latest release | Yes                   |
| `master`       | Yes                   |
| Older releases | No guaranteed support |

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability.

Use [GitHub private vulnerability reporting](https://github.com/dougmaitelli/DockDash/security/advisories/new) to send the maintainers:

- A description of the issue and its potential impact
- Affected versions or commit hashes
- Reproduction steps or a proof of concept
- Any suggested mitigation
- Whether the issue is already public or known to others

Please allow the maintainers a reasonable opportunity to investigate and release a fix before public disclosure. You should receive an initial acknowledgement within seven days. Timelines for validation, remediation, and disclosure depend on severity and complexity and will be coordinated through the private advisory.

## Deployment security

DockDash can control Docker containers, execute commands, and read or modify container files. Access to DockDash should be treated as privileged access to the Docker host.

- Do not expose an unauthenticated instance to an untrusted network.
- Configure OIDC or place DockDash behind an authenticated reverse proxy.
- Protect the Docker socket and consider a restricted Docker socket proxy.
- Store `SESSION_SECRET`, `GITHUB_TOKEN`, OIDC secrets, and notification credentials outside source control.
- Disable container controls, terminal access, or file exploration when they are not needed.

See the [README security guidance](README.md#security) for deployment details.
