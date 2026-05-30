# Security Policy

## Reporting

Please do not open public issues for vulnerabilities or leaked credentials.

Report security issues privately through GitHub Security Advisories for this
repository, or contact the repository maintainers directly.

## Secrets

G-Meter broker configs may reference API keys, but real keys must be supplied
through environment variables or deployment secret stores.

Never commit:

- `.env`
- real API keys
- SQLite databases
- probe logs containing sensitive payloads
- production-only deployment credentials

If a secret is accidentally committed, revoke it immediately and rewrite the
published history before relying on the repository again.
