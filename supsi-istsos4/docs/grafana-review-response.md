Hi Esteban,

Thank you for the detailed checks. We have prepared a version 1.1.1 candidate addressing the version mismatch, outdated Go SDK/toolchain, prohibited environment-variable reads, and the dependency findings for which compatible fixes are available.

The mismatch came from the v1.1.0 source tag still containing package version 1.0.0. The candidate's source and built-plugin versions now agree, and we have added a release check that also validates the lockfile and source tag before packaging.

We updated the Grafana Go SDK to 0.297.0, rebuilt all six backend binaries with Go 1.26.8, and removed the flagged environment-variable reads. Backend tests and all 33 frontend tests pass. govulncheck reports no vulnerabilities in the plugin source or any of the rebuilt binaries, and the official metadata validator passes.

One high-severity finding remains: braces 3.0.3, CVE-2026-93687. This is a transitive dependency of our build, lint, and test tools and is not included as a runtime module in the plugin bundle. The upstream advisory currently lists no patched version:
https://github.com/advisories/GHSA-vfj7-8cjw-p6xm

Could you advise on the accepted review procedure for this unpatched development-only dependency? We have kept the finding visible, and our release audit remains blocked by it. The npm audit also retains moderate findings, so we are not claiming a fully clean dependency scan.

Once the remaining blocker is resolved, we will publish the matching source tag and update the submission through My Plugins.

Best regards,
Daniele
