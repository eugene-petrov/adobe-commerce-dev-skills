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
        if (who === 'codex' && decision.level === 'ask' && subject.texts.some((t) => BYPASS.test(t))) {
            decision = { level: 'allow', reasons: [] };
        }
    } catch (e) {
        process.stderr.write(`guard-sensitive: internal error, allowing: ${e && e.message}\n`);
    }
    finish(who, input, decision);
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
const PATH_KEY = /(path|file|filename|dir|directory|folder)s?$|^(target|source|src|dest|destination|uri)$/i;
const COMMAND_KEY = /^(command|cmd|script|shell)$/i;
const SQL_RE = /\bselect\b[\s\S]*\b(from|join)\b/i;

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
    if (PATH_KEY.test(key) || looksLikePath(value)) subject.paths.push(value);
    if (SQL_RE.test(value)) subject.sql.push(value);
}

function looksLikePath(value) {
    return value.length < 1024 && !/\s/.test(value) && (/[\/\\]/.test(value) || /^[.~]/.test(value));
}

// Shell text that is written, not read: git/gh messages and heredocs redirected into a file.
function stripWrittenText(text) {
    let t = String(text);
    if (/\b(git\s+(commit|tag|notes|stash)|gh\s+(pr|issue|release))\b/.test(t)) {
        t = t.replace(/(\s(?:-m|--message|-t|--title|-b|--body|--notes)(?:\s+|=))("(?:[^"\\]|\\[\s\S])*"|'[^']*')/g, '$1""');
    }
    return t.replace(
        /^([^\n]*<<-?\s*(['"]?)([A-Za-z_]\w*)\2[^\n]*)\n[\s\S]*?\n[ \t]*\3[ \t]*(?=\n|$)/gm,
        (all, head, quote, tag) => (/(^|[;&|(]\s*)(cat\b[^\n]*>|tee\s)/.test(head) ? `${head}\n${tag}` : all)
    );
}

// ---------------------------------------------------------------------------------------------------------
// Rules

function loadConfig(dirs) {
    const base = readJson(path.join(__dirname, 'sensitive-patterns.json')) || {};
    const file = findUp(dirs.filter(Boolean), '.ai-sensitive.json');
    const project = (file && readJson(file)) || {};
    if (file && !readJson(file)) process.stderr.write(`guard-sensitive: ${file} is not valid JSON, ignored\n`);
    const disabled = new Set(Array.isArray(project.disable) ? project.disable : []);
    const rules = (key) => [...(base[key] || []), ...(project[key] || [])]
        .filter((r) => r && r.pattern && !disabled.has(r.id))
        .map((r) => ({ ...r, re: new RegExp(r.pattern, 'i'), requiresRe: r.requires ? new RegExp(r.requires, 'i') : null }));

    const pii = { ...(base.pii || {}) };
    pii.tables = [...(pii.tables || []), ...(project.piiTables || [])];
    if (project.piiLevel) pii.level = project.piiLevel;
    pii.enabled = !disabled.has(pii.id || 'pii-select') && pii.tables.length > 0;

    return {
        paths: rules('paths'),
        commands: rules('commands'),
        text: rules('text'),
        pii,
        allow: [...(base.allow || []), ...(project.allow || [])].map((p) => new RegExp(p, 'i')),
        source: file || '',
    };
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
        const text = stripWrittenText(raw);
        for (const segment of segments(text)) {
            const head = firstWord(segment);
            for (const rule of config.commands) if (rule.re.test(segment)) hits.push(rule);
            for (const token of segment.match(/[\w.~\/@+-]+/g) || []) checkPath(token, head, subject.cwd, config, hits);
        }
    }

    // SQL rules see shell commands (without written text) and SQL found in tool arguments.
    for (const text of [...subject.texts.map(stripWrittenText), ...subject.sql]) {
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
    const variants = [raw, expanded];
    if (!path.isAbsolute(expanded) && cwd) variants.push(path.resolve(cwd, expanded));
    if (variants.some((v) => config.allow.some((re) => re.test(v)))) return;
    for (const rule of config.paths) {
        if (head && Array.isArray(rule.exceptCommands) && rule.exceptCommands.includes(head)) continue;
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
    const words = segment.split(/\s+/);
    let i = 0;
    while (i < words.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i]) || WRAPPERS.has(words[i]))) i++;
    return path.basename((words[i] || '').replace(/^['"(]+|['")]+$/g, ''));
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

    if (agent === 'claude') {
        process.stdout.write(JSON.stringify({
            hookSpecificOutput: {
                hookEventName: 'PreToolUse',
                permissionDecision: decision.level,
                permissionDecisionReason: message,
            },
        }));
        process.exit(0);
    }

    // codex and unknown agents: block with an explanation.
    let text = message;
    if (decision.level === 'ask') {
        text += ' This needs the user\'s approval: ask the user, and only if they approve rerun the same command prefixed with AI_GUARD_ALLOW=1.';
    }
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
