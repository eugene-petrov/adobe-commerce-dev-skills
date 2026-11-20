#!/usr/bin/env node
'use strict';

// Best-effort guard that stops AI coding agents from reading secrets and personal data by accident:
// Magento app/etc/env.php, auth.json, .env, keys, dumps, logs, SELECTs from customer/order tables.
// It is NOT a security boundary: a shell command can always be obfuscated past pattern matching.
//
// One script for several agents (the installer passes --agent):
//   claude  Claude Code PreToolUse  -> stdout hookSpecificOutput.permissionDecision deny|ask
//   codex   Codex PreToolUse        -> exit 2 + stderr (no native "ask": the agent must ask the user and
//                                      rerun the command with AI_GUARD_ALLOW=1; only for "ask" rules)
//   cursor  Cursor beforeReadFile / beforeShellExecution / beforeMCPExecution -> stdout {"permission": ...}
//
// Rules: sensitive-patterns.json next to this file, extended per project by .ai-sensitive.json
// (searched from the working directory upwards).

const fs = require('fs');
const os = require('os');
const path = require('path');

const RANK = { allow: 0, ask: 1, deny: 2 };
const FILE_TOOLS = new Set(['read', 'edit', 'multiedit', 'write', 'notebookedit', 'notebookread', 'grep', 'glob', 'ls']);
const WRAPPERS = new Set(['sudo', 'env', 'command', 'exec', 'nohup', 'time', 'xargs', 'nice']);
const BYPASS = /\bAI_GUARD_ALLOW=1\b/;
// Commands that look at names, sizes or existence, never at contents.
const META_COMMANDS = new Set(['ls', 'stat', 'du', 'wc', 'touch', 'test', '[', '[[', 'file', 'realpath', 'readlink', 'basename', 'dirname']);
// Commands whose last argument is a destination that is written, not read.
const COPY_COMMANDS = new Set(['cp', 'mv', 'ln', 'install']);

function main() {
    const agent = argValue('--agent') || '';
    let input = {};
    try {
        input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
    } catch (e) {
        return finish(detectAgent(agent, input), input, { level: 'allow', reasons: [] });
    }
    const who = detectAgent(agent, input);
    let decision = { level: 'allow', reasons: [] };
    try {
        const subject = extract(input);
        const config = loadConfig([subject.cwd, process.env.CLAUDE_PROJECT_DIR, process.env.CURSOR_PROJECT_DIR]);
        decision = evaluate(subject, config);
        if (needsChatApproval(who, input) && decision.level === 'ask' && subject.texts.some((t) => BYPASS.test(t))) {
            decision = { level: 'allow', reasons: [] };
        }
    } catch (e) {
        process.stderr.write(`guard-sensitive: internal error, allowing: ${e && e.message}\n`);
    }
    finish(who, input, decision);
}

// Where "ask" cannot reach the user as a prompt, the hook blocks instead and the agent must ask in chat, then
// rerun with AI_GUARD_ALLOW=1: Codex (no ask), and Claude Code modes without prompts - bypassPermissions
// disables them, dontAsk auto-denies them. In "auto" mode a hook "ask" still prompts the user (Claude Code
// hooks docs), so the native prompt is kept there.
const NO_PROMPT_MODES = new Set(['bypassPermissions', 'dontAsk']);

function needsChatApproval(agent, input) {
    if (agent === 'codex') return true;
    return agent === 'claude' && NO_PROMPT_MODES.has(input.permission_mode);
}

function argValue(name) {
    const i = process.argv.indexOf(name);
    return i > -1 ? process.argv[i + 1] : '';
}

function detectAgent(agent, input) {
    if (agent) return agent;
    if (input.cursor_version || /^(before|after)[A-Z]/.test(input.hook_event_name || '')) return 'cursor';
    if (input.permission_mode !== undefined || input.transcript_path) return 'claude';
    return 'codex';
}

// ---------------------------------------------------------------------------------------------------------
// What does this tool call touch? -> { kind, cwd, paths: [], texts: [] (shell commands), sql: [] }

function extract(input) {
    const event = input.hook_event_name || '';
    const roots = Array.isArray(input.workspace_roots) ? input.workspace_roots : [];
    const subject = { kind: 'tool', cwd: input.cwd || roots[0] || process.cwd(), paths: [], texts: [], sql: [] };

    if (event === 'beforeReadFile' || event === 'beforeTabFileRead') {
        subject.kind = 'read';
        pushString(subject.paths, input.file_path);
        for (const a of Array.isArray(input.attachments) ? input.attachments : []) pushString(subject.paths, a && a.file_path);
        return subject;
    }
    if (event === 'beforeShellExecution') {
        subject.kind = 'shell';
        pushString(subject.texts, input.command);
        return subject;
    }
    if (event === 'beforeMCPExecution') {
        subject.kind = 'mcp';
        let args = input.tool_input;
        if (typeof args === 'string') {
            try { args = JSON.parse(args); } catch (e) { /* keep the raw string */ }
        }
        collectArgs(args, '', subject, 0);
        return subject;
    }

    // Claude Code / Codex PreToolUse (and anything shaped like it).
    const tool = String(input.tool_name || input.toolName || '').toLowerCase();
    let ti = input.tool_input !== undefined ? input.tool_input : input.toolInput;
    if (typeof ti === 'string') {
        try { ti = JSON.parse(ti); } catch (e) { ti = { raw: ti }; }
    }
    ti = ti && typeof ti === 'object' ? ti : {};

    for (const key of ['file_path', 'notebook_path', 'filePath', 'path']) pushString(subject.paths, ti[key]);
    if (tool === 'grep' && typeof ti.glob === 'string' && ti.glob) {
        // Grep over a directory limited by glob: "app/etc" + "env.php" reads app/etc/env.php.
        subject.paths.push(path.join(typeof ti.path === 'string' && ti.path ? ti.path : '.', ti.glob));
    }

    let command = ti.command !== undefined ? ti.command : ti.cmd;
    if (Array.isArray(command)) command = command.join(' ');
    if (typeof command === 'string' && command) {
        subject.kind = 'shell';
        subject.texts.push(command);
        return subject;
    }
    if (tool === 'apply_patch') {
        // Only the file headers: the patch body is new content, not a read.
        const patch = String(ti.input || ti.patch || ti.raw || '');
        for (const m of patch.matchAll(/^\*\*\* (?:Update|Add|Delete) File: (.+)$/gm)) subject.paths.push(m[1].trim());
        return subject;
    }
    if (!FILE_TOOLS.has(tool)) {
        subject.kind = 'mcp';
        collectArgs(ti, '', subject, 0);
    }
    return subject;
}

function pushString(list, value) {
    if (typeof value === 'string' && value) list.push(value);
}

// MCP / other tool arguments: only what can read something - path-like values, command strings and SQL.
// Free text (chat messages, document bodies, titles) is content the agent writes, not a read.
// Path keys: file, file_path, source-file, paths, filePath, notebookPath, targetDir... but not "profile".
const PATH_KEY_SNAKE = /(^|[_-])(path|file|filename|dir|directory|folder)s?$/i;
const PATH_KEY_CAMEL = /[a-z0-9](Path|File|Filename|FileName|Dir|Directory|Folder)s?$/;
const PATH_KEY_EXACT = /^(target|source|src|dest|destination|uri)$/i;
const isPathKey = (key) => PATH_KEY_SNAKE.test(key) || PATH_KEY_CAMEL.test(key) || PATH_KEY_EXACT.test(key);
const COMMAND_KEY = /^(command|cmd|script|shell)$/i;
const SQL_RE = /\bselect\b[\s\S]*\b(from|join)\b/i;
// Shell commands that can run SQL: database clients, and interpreters given inline code (-r/-c/-e or a heredoc).
const DB_CLIENT = new RegExp([
    /(^|[\s;&|(\/])(mysql|mariadb|mysqlsh|psql|sqlite3|clickhouse-client)(\s|$)/.source,
    /\bwarden\s+db\b|\bddev\s+(mysql|psql)\b|\bn98-magerun2?(\.phar)?\s+db:query\b|\bdb:query\b/.source,
    /(^|[\s;&|(\/])(php|python[0-9.]*|node|ruby|perl)\s+(-[A-Za-z]*\s+)*-[rce]\b/.source,
    /(^|[\s;&|(\/])(php|python[0-9.]*|node|ruby|perl)(\s+-\S+)*\s*<</.source,
].join('|'), 'i');

function collectArgs(value, key, subject, depth) {
    if (depth > 8 || value === null || value === undefined) return;
    if (Array.isArray(value)) {
        for (const v of value) collectArgs(v, key, subject, depth + 1);
        return;
    }
    if (typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) collectArgs(v, k, subject, depth + 1);
        return;
    }
    if (typeof value !== 'string' || !value) return;
    if (COMMAND_KEY.test(key)) {
        subject.texts.push(value);
        return;
    }
    if (isPathKey(key) || looksLikePath(value)) subject.paths.push(value);
    if (SQL_RE.test(value)) subject.sql.push(value);
}

function looksLikePath(value) {
    return value.length < 1024 && !/\s/.test(value) && (/[\/\\]/.test(value) || /^[.~]/.test(value));
}

// Shell text that is written, not read: git/gh messages and heredocs redirected into a file.
// Text that the shell would execute (command substitution, unquoted-heredoc expansion) is never skipped.
const SUBSTITUTION = /\$\(|`/;
const HEREDOC = /^([^\n]*<<-?[ \t]*(['"]?)([A-Za-z_]\w*)\2[^\n]*)\n([\s\S]*?)\n[ \t]*\3[ \t]*(?=\n|$)/gm;

function stripWrittenText(text) {
    let t = String(text);
    if (/\b(git\s+(commit|tag|notes|stash)|gh\s+(pr|issue|release))\b/.test(t)) {
        t = t.replace(
            /(\s(?:-m|--message|-t|--title|-b|--body|--notes)(?:\s+|=))("(?:[^"\\]|\\[\s\S])*"|'[^']*')/g,
            (all, flag, value, offset, whole) => (
                isMessageCommand(whole.slice(commandStart(whole, offset), offset)) && isInertMessage(value)
                    ? `${flag}""`
                    : all
            )
        );
    }
    return t.replace(HEREDOC, (all, head, quote, tag, body) => {
        if (!quote && SUBSTITUTION.test(body)) return all; // <<EOF expands $(...) in the body
        return writesToFile(head) ? `${head}\n${tag}` : all;
    });
}

// Index where the simple command containing position `end` starts: after the last &&, ||, ;, | or newline
// that is outside quotes.
function commandStart(text, end) {
    let start = 0;
    let quote = '';
    for (let i = 0; i < end; i++) {
        const ch = text[i];
        if (quote) {
            if (ch === quote) quote = '';
            else if (ch === '\\' && quote === '"') i++;
            continue;
        }
        if (ch === '"' || ch === "'") quote = ch;
        else if (ch === '\\') i++;
        else if (ch === ';' || ch === '\n' || ch === '|' || (ch === '&' && text[i + 1] === '&')) start = i + 1;
    }
    return start;
}

// The flag belongs to git commit/tag/notes/stash or gh pr/issue/release (env assignments may precede it).
function isMessageCommand(prefix) {
    return /^\s*(?:[A-Za-z_]\w*=(?:'[^']*'|"[^"]*"|\S*)\s+)*(?:git\s+(?:-C\s+\S+\s+)?(?:commit|tag|notes|stash)|gh\s+(?:pr|issue|release))\b/.test(prefix.replace(/^&/, ''));
}

// A message value is inert when the shell substitutes nothing in it: single-quoted, or double-quoted
// without $(...)/backticks, or the usual "$(cat <<'EOF' ... EOF)" form with a plain body.
function isInertMessage(value) {
    if (value.startsWith("'")) return true;
    const heredoc = value.match(/^"\$\(cat <<-?[ \t]*(['"]?)([A-Za-z_]\w*)\1[ \t]*\n([\s\S]*?)\n[ \t]*\2[ \t]*\n?\)"$/);
    if (heredoc) return Boolean(heredoc[1]) || !SUBSTITUTION.test(heredoc[3].replace(/\\[`$]/g, ''));
    return !SUBSTITUTION.test(value.replace(/\\[`$]/g, ''));
}

// The heredoc's own command (after the last && ; ||) only writes it to a file: cat > f, cat >> f, tee f.
function writesToFile(head) {
    const command = head.split(/&&|\|\||;/).pop().trim();
    if (command.includes('|')) return false;
    return /^cat\b.*>/.test(command) || /^tee\s/.test(command);
}

// ---------------------------------------------------------------------------------------------------------
// Rules

// Three layers:
//   defaults  sensitive-patterns.json next to this script
//   user      $AI_SENSITIVE_CONFIG or ~/.config/ai-sensitive.json - trusted: may allow or disable anything
//   project   .ai-sensitive.json found from the working directory upwards - untrusted (it comes with the
//             repository): may add rules and tables, may disable only "ask" rules, and its allow-list applies
//             only to "ask" rules and only to paths inside the project root, so a cloned repo cannot unlock
//             env.php, ~/.ssh or any other "deny" path.
const LEVELS = new Set(['deny', 'ask']);

function loadConfig(dirs) {
    const base = readJson(path.join(__dirname, 'sensitive-patterns.json')) || {};
    const userFile = process.env.AI_SENSITIVE_CONFIG || path.join(os.homedir(), '.config', 'ai-sensitive.json');
    const user = loadOverride(fs.existsSync(userFile) ? userFile : '');
    const projectFile = findUp(dirs.filter(Boolean), '.ai-sensitive.json');
    const project = loadOverride(projectFile && path.resolve(projectFile) !== path.resolve(userFile) ? projectFile : '');
    const projectRoot = projectFile ? path.dirname(path.resolve(projectFile)) : '';

    const byId = new Map();
    for (const key of ['paths', 'commands', 'text']) for (const r of base[key] || []) byId.set(r.id, r);
    const disabled = new Set(user.disable || []);
    for (const id of project.disable || []) {
        const rule = byId.get(id);
        if (rule && rule.level === 'deny') {
            process.stderr.write(`guard-sensitive: ${projectFile} cannot disable deny rule "${id}" (use ${userFile})\n`);
        } else {
            disabled.add(id);
        }
    }

    const valid = (r) => r && r.pattern && LEVELS.has(r.level) && !disabled.has(r.id);
    const rules = (key) => [...(base[key] || []), ...(user[key] || []), ...(project[key] || [])]
        .filter(valid)
        .map((r) => ({ ...r, re: new RegExp(r.pattern, 'i'), requiresRe: r.requires ? new RegExp(r.requires, 'i') : null }));

    const pii = { ...(base.pii || {}) };
    pii.tables = [...(pii.tables || []), ...(user.piiTables || []), ...(project.piiTables || [])];
    for (const level of [user.piiLevel, project.piiLevel]) if (LEVELS.has(level)) pii.level = level;
    pii.enabled = !disabled.has(pii.id || 'pii-select') && pii.tables.length > 0;

    const allow = (list, root) => (Array.isArray(list) ? list : []).map((p) => ({ re: new RegExp(p, 'i'), root }));
    return {
        paths: rules('paths'),
        commands: rules('commands'),
        text: rules('text'),
        pii,
        allow: [...allow(base.allow, ''), ...allow(user.allow, ''), ...allow(project.allow, projectRoot)],
    };
}

function loadOverride(file) {
    if (!file) return {};
    const data = readJson(file);
    if (!data || typeof data !== 'object') {
        process.stderr.write(`guard-sensitive: ${file} is not valid JSON, ignored\n`);
        return {};
    }
    return data;
}

function isInside(file, root) {
    const rel = path.relative(root, file);
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function readJson(file) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return null; }
}

function findUp(dirs, name) {
    for (const start of dirs) {
        let dir = path.resolve(start);
        for (;;) {
            const candidate = path.join(dir, name);
            if (fs.existsSync(candidate)) return candidate;
            const parent = path.dirname(dir);
            if (parent === dir) break;
            dir = parent;
        }
    }
    return '';
}

// ---------------------------------------------------------------------------------------------------------
// Evaluation

function evaluate(subject, config) {
    const hits = [];

    for (const p of subject.paths) checkPath(p, '', subject.cwd, config, hits);

    for (const raw of subject.texts) {
        const text = stripIdentityArgs(stripWrittenText(raw));
        for (const segment of segments(text)) {
            const head = firstWord(segment);
            for (const rule of config.commands) if (rule.re.test(segment)) hits.push(rule);
            if (META_COMMANDS.has(head)) continue; // names, sizes, existence - not contents
            const destination = COPY_COMMANDS.has(head) ? lastArgument(segment) : '';
            for (const token of segment.match(/[\w.~\/@+-]+/g) || []) {
                if (destination && token === destination) continue; // cp x .env writes .env, does not read it
                checkPath(token, head, subject.cwd, config, hits);
            }
        }
    }

    // SQL rules see shell commands that run a database client (grep/rg over code with SQL in the pattern
    // is not a query) and SQL found in tool arguments.
    const shellSql = subject.texts.map(stripWrittenText).filter((t) => DB_CLIENT.test(t));
    for (const text of [...shellSql, ...subject.sql]) {
        for (const rule of config.text) {
            if ((!rule.requiresRe || rule.requiresRe.test(text)) && rule.re.test(text)) hits.push(rule);
        }
        const pii = piiHit(text, config.pii);
        if (pii) hits.push(pii);
    }

    if (!hits.length) return { level: 'allow', reasons: [] };
    const level = hits.reduce((top, r) => (RANK[r.level] > RANK[top] ? r.level : top), 'allow');
    const seen = new Set();
    const reasons = [];
    for (const r of hits) {
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        reasons.push({ id: r.id, level: r.level, reason: r.reason || r.id, hint: r.hint || '', match: r.match || '' });
    }
    return { level, reasons };
}

function checkPath(candidate, head, cwd, config, hits) {
    const raw = candidate.replace(/^['"]+|['"]+$/g, '');
    if (!raw || raw.length < 4) return;
    const expanded = raw.replace(/^~(?=\/|$)/, os.homedir());
    const absolute = path.isAbsolute(expanded) ? path.normalize(expanded) : path.resolve(cwd || process.cwd(), expanded);
    const variants = [raw, expanded, absolute];
    const matching = config.allow.filter((a) => (!a.root || isInside(absolute, a.root)) && variants.some((v) => a.re.test(v)));
    if (matching.some((a) => !a.root)) return; // defaults / user config: trusted
    const projectAllowed = matching.length > 0; // project config: unlocks only "ask" rules
    for (const rule of config.paths) {
        if (projectAllowed && rule.level !== 'deny') continue;
        if (head && Array.isArray(rule.exceptCommands) && rule.exceptCommands.includes(head)) continue;
        // onlyCommands: the rule is about what these commands do with the path (e.g. recursive search of a
        // directory); direct file-tool calls (no head) are included.
        if (head && Array.isArray(rule.onlyCommands) && !rule.onlyCommands.includes(head)) continue;
        if (variants.some((v) => rule.re.test(v))) hits.push({ ...rule, match: raw });
    }
}

function segments(text) {
    return String(text)
        .split(/\|\||&&|[;|&\n]|\$\(|`/)
        .map((s) => s.trim())
        .filter(Boolean);
}

function firstWord(segment) {
    // Leading VAR=value assignments, including quoted values with spaces (GIT_SSH_COMMAND='ssh -i k').
    const words = segment.replace(/^\s*(?:[A-Za-z_]\w*=(?:'[^']*'|"[^"]*"|\S*)\s+)*/, '').split(/\s+/);
    let i = 0;
    while (i < words.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i]) || WRAPPERS.has(words[i]))) i++;
    return path.basename((words[i] || '').replace(/^['"(]+|['")]+$/g, ''));
}

function lastArgument(segment) {
    const words = segment.split(/\s+/).filter((w) => w && !w.startsWith('-'));
    return words.length > 1 ? words[words.length - 1].replace(/^['"]+|['"]+$/g, '') : '';
}

// ssh/scp/rsync/git use a private key without printing it: drop only the identity-file arguments from the
// scan, so that reading or copying a key (ssh host 'cat ~/.ssh/id_rsa', scp host:~/.ssh/id_rsa .) is still caught.
function stripIdentityArgs(text) {
    if (!/\b(ssh|scp|sftp|rsync|GIT_SSH_COMMAND|RSYNC_RSH|sshCommand)\b/.test(text)) return text;
    return text
        .replace(/(^|[\s'"=])-i\s*(['"]?)[^\s'"]+\2/g, '$1')
        .replace(/IdentityFile[=\s]+(['"]?)[^\s'"]+\1/gi, '');
}

function piiHit(text, pii) {
    if (!pii.enabled || !/\bselect\b/i.test(text)) return null;
    const names = pii.tables.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const tableRe = new RegExp(`(?<![A-Za-z0-9_])(?:[A-Za-z0-9]+_)?(${names})(?![A-Za-z0-9_])`, 'i');
    const found = text.match(tableRe);
    if (!found) return null;
    const selects = [...text.matchAll(/\bselect\s+([\s\S]*?)\s+from\b/gi)].map((m) => m[1]);
    const countOnly = /^\s*count\s*\(\s*(distinct\s+)?[\w.*`]*\s*\)(\s+(as\s+)?\w+)?\s*$/i;
    if (selects.length && selects.every((s) => countOnly.test(s))) return null;
    return { id: pii.id || 'pii-select', level: pii.level || 'ask', reason: pii.reason || 'SELECT from a personal-data table', hint: pii.hint || '', match: found[1] };
}

// ---------------------------------------------------------------------------------------------------------
// Response per agent

function finish(agent, input, decision) {
    const event = input.hook_event_name || '';
    const message = describe(decision);

    if (agent === 'cursor') {
        const out = { permission: 'allow' };
        if (decision.level !== 'allow') {
            const readEvent = event === 'beforeReadFile' || event === 'beforeTabFileRead';
            out.permission = readEvent ? 'deny' : decision.level; // file reads have no "ask"
            out.user_message = message;
            if (!readEvent) out.agent_message = message;
        }
        process.stdout.write(JSON.stringify(out));
        process.exit(0);
    }

    if (decision.level === 'allow') process.exit(0);

    const chatApproval = ' This needs the user\'s approval: ask the user, and only if they approve rerun the same command prefixed with AI_GUARD_ALLOW=1.';

    if (agent === 'claude') {
        const blockAsk = decision.level === 'ask' && needsChatApproval(agent, input);
        process.stdout.write(JSON.stringify({
            hookSpecificOutput: {
                hookEventName: 'PreToolUse',
                permissionDecision: blockAsk ? 'deny' : decision.level,
                permissionDecisionReason: blockAsk ? message + chatApproval : message,
            },
        }));
        process.exit(0);
    }

    // codex and unknown agents: block with an explanation.
    let text = message;
    if (decision.level === 'ask') text += chatApproval;
    process.stderr.write(text + '\n');
    process.exit(2);
}

function describe(decision) {
    const parts = decision.reasons.map((r) => {
        let s = `${r.reason}${r.match ? ` (${r.match})` : ''} [${r.id}]`;
        if (r.hint) s += `. ${r.hint.replace(/\.\s*$/, '')}`;
        return s;
    });
    const verb = decision.level === 'deny' ? 'blocked' : 'needs approval';
    return `Sensitive-data guard ${verb}: ${parts.join('; ')}. Rules: adobe-commerce-dev-skills/hooks; project overrides: .ai-sensitive.json.`;
}

main();
