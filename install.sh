#!/usr/bin/env bash
# Install Adobe Commerce / Magento skills for an AI coding agent.
#
# Usage:
#   ./install.sh --list
#   ./install.sh [options] <skill>... | --all
#
# Options:
#   --agent claude|codex   target agent (default: claude)
#                          claude -> <base>/.claude/skills   codex -> <base>/.agents/skills
#   --dir PATH             install into PATH instead (any agent that reads SKILL.md folders)
#   --project              base = current directory (default: base = $HOME, i.e. global install)
#   --copy                 copy instead of symlink (use when the agent runs in a container)
#   --force                replace an existing skill directory/link with the same name
#
# Dependencies listed in skills/<name>/requires.txt are installed automatically.
# Symlinked skills update with `git pull`; copied skills need re-running the installer.

set -eu

repo="$(cd "$(dirname "$0")" && pwd -P)"
skills_dir="$repo/skills"
agent="claude"
target=""
base="$HOME"
mode="link"
force=0
requested=""

usage() { sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'; }

list_skills() {
    for d in "$skills_dir"/*/; do
        name="$(basename "$d")"
        desc="$(sed -n 's/^description: //p' "$d/SKILL.md" | head -1 | cut -c1-110)"
        printf '%-26s %s...\n' "$name" "$desc"
    done
}

while [ $# -gt 0 ]; do
    case "$1" in
        --list) list_skills; exit 0 ;;
        --all) requested="$requested $(for d in "$skills_dir"/*/; do basename "$d"; done | tr '\n' ' ')" ;;
        --agent) agent="${2:?}"; shift ;;
        --dir) target="${2:?}"; shift ;;
        --project) base="$(pwd -P)" ;;
        --copy) mode="copy" ;;
        --force) force=1 ;;
        -h|--help) usage; exit 0 ;;
        -*) echo "Unknown option: $1" >&2; usage; exit 2 ;;
        *) requested="$requested $1" ;;
    esac
    shift
done

[ -n "${requested// /}" ] || { usage; exit 2; }

if [ -z "$target" ]; then
    case "$agent" in
        claude) target="$base/.claude/skills" ;;
        codex) target="$base/.agents/skills" ;;
        *) echo "Unknown agent '$agent'; use --dir PATH for other agents." >&2; exit 2 ;;
    esac
fi

# Resolve dependencies (depth-first, each skill once).
resolved=""
resolve() {
    local name="$1" dep
    case " $resolved " in *" $name "*) return ;; esac
    [ -f "$skills_dir/$name/SKILL.md" ] || { echo "No such skill: $name (see --list)" >&2; exit 1; }
    if [ -f "$skills_dir/$name/requires.txt" ]; then
        while IFS= read -r dep; do
            if [ -n "$dep" ]; then resolve "$dep"; fi
        done < "$skills_dir/$name/requires.txt"
    fi
    resolved="$resolved $name"
}
for name in $requested; do resolve "$name"; done

mkdir -p "$target"
for name in $resolved; do
    dest="$target/$name"
    if [ -e "$dest" ] || [ -L "$dest" ]; then
        if [ -L "$dest" ] && [ "$(cd "$dest" 2>/dev/null && pwd -P)" = "$skills_dir/$name" ] && [ "$mode" = "link" ]; then
            echo "ok       $name (already linked)"
            continue
        fi
        if [ "$force" -ne 1 ]; then
            echo "skip     $name: $dest exists (use --force to replace)" >&2
            continue
        fi
        rm -rf "$dest"
    fi
    if [ "$mode" = "copy" ]; then
        cp -R "$skills_dir/$name" "$dest"
        echo "copied   $name -> $dest"
    else
        ln -s "$skills_dir/$name" "$dest"
        echo "linked   $name -> $dest"
    fi
done
