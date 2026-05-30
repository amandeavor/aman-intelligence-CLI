# Security Policy

## Integrity model

Aman uses **SHA-256 checksums** on canonical asset content files:

- Computed at publish (registry) and on install (local materialization)
- Stored in `metadata.json` and `aman.lock`
- Verified on registry install; mismatch **blocks** the install

### What checksums protect against

- Accidental corruption (disk, partial writes, bad copies)
- Tampering with content **after** a trusted publish record was created
- Drift between registry record and files on disk during install

### What checksums do not protect against

- Malicious content **authored by the publisher** (checksum matches by design)
- Compromised publisher accounts or stolen signing keys (V1: signatures are `null`)
- Supply-chain attacks in marketplace discovery providers (always verify registry pins)
- Secrets committed inside content files (review before publish; use `mcp.local.json` for MCP secrets)

## Install-time execution

Aman **does not run** publisher scripts, hooks, or binaries during install. Installation is copy + verify + lockfile update only.

## Reporting a vulnerability

Email or open a **private** security advisory on GitHub if available:

- Repository: https://github.com/aman-intelligence/aman-cli
- Include reproduction steps, impact, and suggested fix if known

Do not open public issues for exploitable vulnerabilities before a fix is available.

## Supported versions

| Version | Supported |
|---------|-----------|
| 1.0.x | Yes |

## Safe defaults

- Quarantine corrupt `aman.json` and invalid `aman.lock` rather than crash
- Atomic lockfile writes (temp file + rename)
- Backup restore rolls back on failure
- Path traversal checks on pack extract and import
