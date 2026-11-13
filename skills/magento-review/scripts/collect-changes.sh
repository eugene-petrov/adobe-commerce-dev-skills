#!/usr/bin/env bash
# Collect the change set of a Magento task and run cheap mechanical checks on CHANGED LINES only.
# Usage (from anywhere inside the repo): collect-changes.sh [base-ref]
#   base-ref defaults to HEAD (= uncommitted + untracked work). For a branch review pass e.g. origin/master;
#   the merge-base with HEAD is used, so commits that landed on the base later are not shown inverted.
# Output is plain text sections. Hints are leads to verify, not findings.

set -u

root="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "Not a git repository" >&2; exit 1; }
cd "$root" || exit 1

base="${1:-HEAD}"
if [ "$base" != "HEAD" ]; then
    mb="$(git merge-base "$base" HEAD 2>/dev/null)" || { echo "Unknown base ref: $base" >&2; exit 1; }
    base="$mb"
fi

tmp="$(mktemp -d "${TMPDIR:-/tmp}/magento-review.XXXXXX")"
trap 'rm -rf "$tmp"' EXIT

section() { printf '\n===== %s =====\n' "$1"; }
is_text() { case "$(file -b --mime-encoding "$1" 2>/dev/null)" in binary|'') return 1 ;; *) return 0 ;; esac; }

# ---------------------------------------------------------------- change set
git diff --name-only --diff-filter=ACMR "$base" -- > "$tmp/tracked"
git ls-files --others --exclude-standard > "$tmp/untracked"
sort -u "$tmp/tracked" "$tmp/untracked" > "$tmp/files"

section "git status --short"
git status --short

section "Changed files vs ${1:-HEAD} ($(wc -l < "$tmp/files" | tr -d ' ') files; untracked marked with ?)"
while IFS= read -r f; do
    if grep -qxF -- "$f" "$tmp/untracked"; then echo "? $f"; else echo "  $f"; fi
done < "$tmp/files"
git diff --name-only --diff-filter=D "$base" -- | sed 's/^/- (deleted) /'

# Added lines as "file<TAB>line<TAB>content": tracked from a zero-context diff, untracked = whole file.
git diff -U0 --no-color --no-ext-diff --diff-filter=ACMR "$base" -- | awk '
    /^diff --git / { inhunk = 0; next }
    !inhunk && /^\+\+\+ / { f = substr($0, 7); next }
    /^@@ / { split($3, a, ","); ln = substr(a[1], 2) + 0; inhunk = 1; next }
    inhunk && /^\+/ { printf "%s\t%d\t%s\n", f, ln, substr($0, 2); ln++; next }
' > "$tmp/added"
while IFS= read -r f; do
    [ -f "$f" ] && is_text "$f" && awk -v f="$f" '{ printf "%s\t%d\t%s\n", f, FNR, $0 }' "$f" >> "$tmp/added"
done < "$tmp/untracked"
cut -f1,2 "$tmp/added" | tr '\t' ':' | sort -u > "$tmp/lines"

# ---------------------------------------------------------------- encoding
section "Encoding / BOM / CRLF"
enc_issues=0
while IFS= read -r f; do
    [ -f "$f" ] || continue
    enc="$(file -b --mime-encoding "$f")"
    [ "$enc" = "binary" ] && continue
    case "$enc" in us-ascii|utf-8) ;; *) echo "ENCODING $enc: $f"; enc_issues=1 ;; esac
    if [ "$(head -c3 "$f" | od -An -tx1 | tr -d ' \n')" = "efbbbf" ]; then echo "BOM: $f"; enc_issues=1; fi
    if grep -q $'\r' "$f"; then
        if git cat-file -e "$base:$f" 2>/dev/null && git show "$base:$f" | grep -q $'\r'; then
            : # CRLF already in base - preserved, fine
        else
            echo "CRLF introduced: $f"; enc_issues=1
        fi
    fi
done < "$tmp/files"
[ "$enc_issues" = 0 ] && echo "ok"

# ---------------------------------------------------------------- whitespace
section "git diff --check (tracked + untracked)"
{
    git diff --check "$base" --
    while IFS= read -r f; do
        [ -f "$f" ] && is_text "$f" && git diff --no-index --check /dev/null "$f" 2>/dev/null
    done < "$tmp/untracked"
} | grep -v '^+' > "$tmp/ws"
if [ -s "$tmp/ws" ]; then cat "$tmp/ws"; else echo "ok"; fi

# ---------------------------------------------------------------- PHP runtime
grep -E '\.(php|phtml)$' "$tmp/files" | while IFS= read -r f; do [ -f "$f" ] && echo "$f"; done > "$tmp/php"

runner=()
detect="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/../../magento-exec-shell-cmd/scripts/detect_env.sh"
envname="local"
wrapper=""
if [ -x "$detect" ]; then
    envname="$("$detect" . | sed -n 's/^env=//p')"
    wrapper="$("$detect" . | sed -n 's/^wrapper=//p')"
fi
if [ -n "$wrapper" ]; then
    # shellcheck disable=SC2206
    runner=($wrapper)
    where="$envname runtime ($wrapper)"
elif command -v php >/dev/null 2>&1; then
    where="host PHP $(php -r 'echo PHP_VERSION;') (project runtime may differ; set MAGENTO_EXEC to override)"
else
    where=""
fi
run_php() { if [ ${#runner[@]} -gt 0 ]; then "${runner[@]}" "$@"; else "$@"; fi; }

section "php -l ($(wc -l < "$tmp/php" | tr -d ' ') files; ${where:-no PHP available})"
if [ ! -s "$tmp/php" ]; then
    echo "no PHP files changed"
elif [ -z "$where" ]; then
    echo "skipped"
else
    # Paths are word-split in chunks of 50 (Magento paths contain no spaces).
    out="$(tr '\n' ' ' < "$tmp/php" | xargs -n 50 echo | while IFS= read -r chunk; do
        # shellcheck disable=SC2086
        run_php sh -c 'for f in "$@"; do php -l "$f" 2>&1; done' sh $chunk
    done | grep -v '^No syntax errors detected')"
    if [ -n "$out" ]; then echo "$out"; else echo "ok"; fi
fi

# ---------------------------------------------------------------- phpcs
section "phpcs --standard=Magento2 (changed lines only)"
if [ ! -s "$tmp/php" ]; then
    echo "no PHP files changed"
elif [ ! -x vendor/bin/phpcs ] || [ -z "$where" ]; then
    echo "skipped: vendor/bin/phpcs or PHP not available"
else
    tr '\n' ' ' < "$tmp/php" | xargs -n 50 echo | while IFS= read -r chunk; do
        # shellcheck disable=SC2086
        run_php php vendor/bin/phpcs --standard=Magento2 --basepath=. --report=emacs -q -s $chunk 2>/dev/null
    done | sed -e "s#^$root/##" -e 's#^\./##' > "$tmp/phpcs"
    total="$(grep -cE '^[^:]+:[0-9]+:' "$tmp/phpcs" || true)"
    awk -F: 'NR == FNR { keep[$1 ":" $2] = 1; next } ($1 ":" $2) in keep' "$tmp/lines" "$tmp/phpcs" > "$tmp/phpcs.changed"
    shown="$(wc -l < "$tmp/phpcs.changed" | tr -d ' ')"
    if [ "$shown" -gt 0 ]; then cat "$tmp/phpcs.changed"; else echo "ok on changed lines"; fi
    echo "($shown on changed lines, $((total - shown)) on untouched lines suppressed)"
fi

# ---------------------------------------------------------------- grep hints on added lines
section "Hints on added lines (verify before reporting)"
awk -F'\t' '
    function hint(label) { c = $3; sub(/^[ \t]+/, "", c); printf "%s:%s [%s] %s\n", $1, $2, label, substr(c, 1, 140); n++ }
    {
        php = ($1 ~ /\.(php|phtml)$/); xml = ($1 ~ /\.xml$/); js = ($1 ~ /\.js$/)
        comment = ($3 ~ /^[ \t]*(\*|\/\/|\/\*|#)/)
        if (php && $3 ~ /ObjectManager::getInstance/)                         hint("direct ObjectManager")
        if (php && !comment && $3 ~ /(^|[^_a-zA-Z>:])json_(en|de)code[ \t]*\(/) hint("use Serializer\\Json")
        if (php && $3 ~ /^[ \t]*(public|protected|private)[ \t]+(readonly[ \t]+)?[?]?[A-Za-z_\\][A-Za-z0-9_\\|]*[ \t]+\$[A-Za-z_][A-Za-z0-9_]*[ \t]*(=[^;]*)?[,)][ \t]*$/) hint("constructor property promotion - check the project rule")
        if (php && !comment && $3 ~ /getConnection\(\)->query\(/)               hint("raw SQL - ResourceModel only")
        if (php && !comment && $3 ~ /(^|[=(,!. \t])@[a-z_]+\(/)                 hint("error suppression")
        if (php && $3 ~ /catch[ \t]*\([^)]*\)[ \t]*\{[ \t]*\}/)                hint("empty catch")
        if (php && $3 ~ /\$_(GET|POST|REQUEST|COOKIE|SERVER|FILES)\[/)           hint("superglobal - use RequestInterface")
        if ((php || js) && !comment && $3 ~ /(var_dump|print_r|var_export|debug_zval_dump)[ \t]*\(|(^|[^a-zA-Z_])die[ \t]*\(|console\.log\(/) hint("debug leftover?")
        if (xml && $3 ~ /cacheable="false"/)                                    hint("disables FPC for the whole page")
        if (php && $3 ~ /->(load|save|delete)\([^)]*\)[ \t]*;/ && $3 !~ /(Repository|repository|Resource|resource)/) hint("model load/save/delete - repository/ResourceModel?")
        if (php && !comment && $3 ~ /(^|[^a-zA-Z_>:])assert[ \t]*\(/)           hint("assert() - use explicit guard + exception")
        rjs = ($1 ~ /requirejs-config\.js$/); phtml = ($1 ~ /\.phtml$/)
        if (js && $3 ~ /async[ \t]*:[ \t]*false/)                               hint("synchronous AJAX")
        if (rjs && $3 ~ /(^|[^a-zA-Z_])deps[ \t]*:/)                            hint("requirejs deps load on every page")
        if (phtml && $3 ~ /<script/ && $3 !~ /text\/x-magento-init/)            hint("inline script - use $secureRenderer (CSP)")
        if (js && $3 ~ /debugger;/)                                             hint("debugger statement")
        if (php && $3 ~ /addslashes[ \t]*\(/)                                    hint("addslashes - context-correct escaping?")
    }
    END { if (!n) print "none" }
' "$tmp/added" > "$tmp/hints"
# New PHP class files without strict_types (standards: [rule] for new files).
{ git diff --name-only --diff-filter=A "$base" --; cat "$tmp/untracked"; } | sort -u | grep -E '\.php$' \
    | while IFS= read -r f; do
        [ -f "$f" ] && ! grep -q 'declare(strict_types=1)' "$f" && echo "$f:1 [new file without declare(strict_types=1)]"
    done >> "$tmp/hints"
if grep -qv '^none$' "$tmp/hints"; then grep -v '^none$' "$tmp/hints"; else echo "none"; fi
