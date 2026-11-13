#!/usr/bin/env bash
# Run a command inside the Magento project's PHP runtime (container or local).
# Usage (from the Magento root): run.sh <command> [args...]
#   run.sh bin/magento cache:clean config
#   run.sh php -l app/code/Vendor/Module/Model/Foo.php
# Detection rules and the MAGENTO_EXEC override are in detect_env.sh.

set -u
here="$(cd "$(dirname "$0")" && pwd)"
wrapper="$("$here/detect_env.sh" . | sed -n 's/^wrapper=//p')"

if [ $# -eq 0 ]; then
    echo "usage: run.sh <command> [args...]" >&2
    exit 2
fi

if [ -z "$wrapper" ]; then
    exec "$@"
fi
# shellcheck disable=SC2086
exec $wrapper "$@"
