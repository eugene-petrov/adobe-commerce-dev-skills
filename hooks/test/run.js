#!/usr/bin/env node
'use strict';

// Runs guard-sensitive.js against test/cases.json and checks the decision per agent.
// Usage: node hooks/test/run.js

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const guard = path.join(__dirname, '..', 'guard-sensitive.js');
const cases = JSON.parse(fs.readFileSync(path.join(__dirname, 'cases.json'), 'utf8'));
// Run from an empty directory so a real .ai-sensitive.json up the tree cannot change the result.
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-test-'));

function decision(agent, result) {
    if (agent === 'cursor') {
        const out = JSON.parse(result.stdout || '{}');
        return out.permission || 'invalid';
    }
    if (agent === 'claude') {
        if (result.status !== 0) return `exit ${result.status}`;
        if (!result.stdout) return 'allow';
        return JSON.parse(result.stdout).hookSpecificOutput.permissionDecision;
    }
    if (result.status === 0) return 'allow';
    if (result.status !== 2) return `exit ${result.status}`;
    return /AI_GUARD_ALLOW=1/.test(result.stderr) ? 'ask' : 'deny';
}

let failed = 0;
for (const c of cases) {
    const input = { ...c.input };
    if (input.cwd) input.cwd = sandbox;
    if (Array.isArray(input.workspace_roots)) input.workspace_roots = [sandbox];
    const result = spawnSync(process.execPath, [guard, '--agent', c.agent], {
        input: JSON.stringify(input).split('/srv/shop').join(sandbox),
        encoding: 'utf8',
        cwd: sandbox,
        env: { ...process.env, CLAUDE_PROJECT_DIR: '', CURSOR_PROJECT_DIR: '' },
    });
    let got;
    try { got = decision(c.agent, result); } catch (e) { got = `bad output: ${result.stdout}`; }
    if (got !== c.expect) {
        failed++;
        console.log(`FAIL  ${c.name}: expected ${c.expect}, got ${got}\n      ${(result.stderr || result.stdout).trim()}`);
    } else {
        console.log(`ok    ${c.name}`);
    }
}
fs.rmSync(sandbox, { recursive: true, force: true });
console.log(`\n${cases.length - failed}/${cases.length} passed`);
process.exit(failed ? 1 : 0);
