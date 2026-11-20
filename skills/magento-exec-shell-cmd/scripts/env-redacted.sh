#!/usr/bin/env bash
# Print the project's app/etc/env.php with secret values masked (run from the Magento root).
# Usage: env-redacted.sh
# Runs PHP in the project's runtime (see run.sh); the script is passed on stdin, so it works in containers.

set -eu
here="$(cd "$(dirname "$0")" && pwd)"
exec "$here/run.sh" php < "$here/env-redacted.php"
