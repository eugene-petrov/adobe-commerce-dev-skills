#!/usr/bin/env node
'use strict';

// Registers guard-sensitive.js in an agent's user-level hook config, keeping every other hook.
// Usage: node hooks/install-hooks.js --agent claude|codex|cursor [--uninstall] [--config PATH] [--dry-run]
//   claude -> ~/.claude/settings.json   (hooks.PreToolUse)
//   codex  -> ~/.codex/hooks.json       (hooks.PreToolUse; Codex asks to trust the changed hook)
//   cursor -> ~/.cursor/hooks.json      (beforeReadFile, beforeShellExecution, beforeMCPExecution)
// Re-running replaces the previous entry. A backup <config>.bak is written before every change.

const fs = require('fs');
const os = require('os');
const path = require('path');

const GUARD = path.join(__dirname, 'guard-sensitive.js');
const MARKER = 'guard-sensitive.js';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i > -1 ? args[i + 1] : ''; };
const agent = opt('--agent');
const uninstall = args.includes('--uninstall');
const dryRun = args.includes('--dry-run');

const defaults = {
    claude: path.join(os.homedir(), '.claude', 'settings.json'),
    codex: path.join(os.homedir(), '.codex', 'hooks.json'),
    cursor: path.join(os.homedir(), '.cursor', 'hooks.json'),
};
if (!defaults[agent]) {
    console.error('usage: install-hooks.js --agent claude|codex|cursor [--uninstall] [--config PATH] [--dry-run]');
    process.exit(2);
}
const file = opt('--config') || defaults[agent];

// Absolute node path: GUI apps (Cursor, Codex desktop) often run hooks without the shell's PATH (nvm).
const command = `"${process.execPath}" "${GUARD}" --agent ${agent}`;

let raw = '';
let config = {};
if (uninstall && !fs.existsSync(file)) {
    console.log(`ok       ${file} does not exist, nothing to remove`);
    process.exit(0);
}
if (fs.existsSync(file)) {
    raw = fs.readFileSync(file, 'utf8');
    try { config = raw.trim() ? JSON.parse(raw) : {}; } catch (e) {
        console.error(`${file} is not valid JSON, not touching it: ${e.message}`);
        process.exit(1);
    }
}
config.hooks = config.hooks || {};

const isOurs = (h) => typeof (h && h.command) === 'string' && h.command.includes(MARKER);

// Remove previous entries (Claude/Codex: groups with a hooks[] list; Cursor: flat entries).
function strip(list, grouped) {
    if (!Array.isArray(list)) return [];
    if (!grouped) return list.filter((h) => !isOurs(h));
    return list
        .map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !isOurs(h)) }))
        .filter((g) => g.hooks.length > 0);
}

if (agent === 'cursor') {
    config = { version: config.version || 1, ...config };
    for (const event of ['beforeReadFile', 'beforeShellExecution', 'beforeMCPExecution']) {
        const list = strip(config.hooks[event], false);
        if (!uninstall) list.push({ command, timeout: 10 });
        if (list.length) config.hooks[event] = list; else delete config.hooks[event];
    }
} else {
    const list = strip(config.hooks.PreToolUse, true);
    if (!uninstall) {
        const group = { hooks: [{ type: 'command', command, timeout: 10 }] };
        // Claude Code supports matchers; Codex runs PreToolUse for every tool call.
        if (agent === 'claude') group.matcher = 'Read|Edit|MultiEdit|Write|NotebookEdit|Grep|Bash|mcp__.*';
        list.push(group);
    }
    if (list.length) config.hooks.PreToolUse = list; else delete config.hooks.PreToolUse;
}

const indent = (raw.match(/^[ \t]+(?=")/m) || ['  '])[0];
const out = JSON.stringify(config, null, indent) + '\n';

if (dryRun) {
    process.stdout.write(out);
    process.exit(0);
}
if (out === raw) {
    console.log(`ok       ${file} (unchanged)`);
    process.exit(0);
}
fs.mkdirSync(path.dirname(file), { recursive: true });
if (raw) fs.writeFileSync(`${file}.bak`, raw);
fs.writeFileSync(file, out);
console.log(`${uninstall ? 'removed ' : 'hooked  '} ${agent}: ${file}${raw ? ` (backup: ${file}.bak)` : ''}`);
if (agent === 'codex' && !uninstall) {
    console.log('         Codex runs a new or changed hook only after you trust it: review it when Codex asks.');
}
