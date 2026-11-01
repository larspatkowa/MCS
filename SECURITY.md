# Security

## Supported releases

Security fixes are provided for the latest published MCS release.

## Deployment boundary

MCS is a local-first application. It listens on `127.0.0.1` by default. Remote
multi-user mode provides account sessions and project-level access checks, but
MCS does not terminate TLS. Put it behind an HTTPS proxy and restrict network
access. Vehicle command execution is not part of this release.

Binding to a non-loopback interface requires `--allow-remote`,
`MCS_AUTH_REQUIRED=1`, and a high-entropy `MCS_BOOTSTRAP_TOKEN`. The first
administrator is created through `/login`; remove the bootstrap secret from
the service environment after setup. Use project-scoped API tokens for
acquisition bridges and revoke them when no longer needed. Do not expose the
service directly to the public internet.

Project files and imported telemetry logs are untrusted input. Keep backups of
valuable projects before importing logs or upgrading across versions. The
`mcs backup` command creates a hash-verified project snapshot; `mcs restore`
verifies it and writes to a new or empty directory. Keep backups separate from
the service host when they are needed for disaster recovery.

## Reporting a vulnerability

Please use GitHub's private security advisory flow for the repository. Include the affected version, reproduction steps, impact, and any proposed mitigation. Do not open a public issue for an unpatched vulnerability.
