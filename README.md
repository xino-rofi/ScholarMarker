# ISOLATED UPDATER TEST — NOT A PRODUCT RELEASE

Explicitly authorized test branch for Windows / Zotero 10.0.8. Do not install these packages in a daily profile. No main/updates.json or public Beta Release is changed. Source here corresponds to the test-only 0.9.4beta3 package; business changes relative to Beta1 are limited to transient display-size resolution. Update-channel metadata intentionally differs from the production candidate.

The XPI below is not accepted for public rollout. JSON fixtures include deliberate bad-hash and incompatible-host cases. They are for isolated updater failure tests only. GPL-3.0-or-later within LICENSE-SCOPE.md. Build: node scripts/build.cjs.
