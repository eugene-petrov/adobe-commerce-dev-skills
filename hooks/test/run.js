#!/usr/bin/env node
'use strict';

// Runs guard-sensitive.js against test/cases.json and checks the decision per agent.
// Usage: node hooks/test/run.js
//
// A case may carry "projectConfig" (written as <project>/.ai-sensitive.json) and "userConfig" (passed via
// AI_SENSITIVE_CONFIG). "/srv/shop" in inputs is replaced with a temporary project directory.

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const guard = path.join(__dirname, '..', 'guard-sensitive.js');
const cases = JSON.parse(fs.readFileSync(path.join(__dirname, 'cases.json'), 'utf8'));
// An empty temp tree, so a real .ai-sensitive.json or ~/.config/ai-sensitive.json cannot change results.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-test-'));
const project = path.join(tmp, 'project');
const userConfig = path.join(tmp, 'user-config.json');
fs.mkdirSync(project);

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
    const projectFile = path.join(project, '.ai-sensitive.json');
    fs.rmSync(projectFile, { force: true });
    fs.rmSync(userConfig, { force: true });
    if (c.projectConfig) fs.writeFileSync(projectFile, JSON.stringify(c.projectConfig));
    if (c.userConfig) fs.writeFileSync(userConfig, JSON.stringify(c.userConfig));

    const result = spawnSync(process.execPath, [guard, '--agent', c.agent], {
        input: JSON.stringify(c.input).split('/srv/shop').join(project),
        encoding: 'utf8',
        cwd: project,
        env: { ...process.env, CLAUDE_PROJECT_DIR: '', CURSOR_PROJECT_DIR: '', AI_SENSITIVE_CONFIG: userConfig },
    });
    let got;
    try { got = decision(c.agent, result); } catch (e) { got = `bad output: ${result.stdout}`; }
    // The guard fails open on internal errors; a test that passes only because of that is a failure.
    if (/internal error/.test(result.stderr)) got = `internal error: ${result.stderr.trim()}`;
    if (got !== c.expect) {
        failed++;
        console.log(`FAIL  ${c.name}: expected ${c.expect}, got ${got}\n      ${(result.stderr || result.stdout).trim()}`);
    } else {
        console.log(`ok    ${c.name}`);
    }
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${cases.length - failed}/${cases.length} passed`);
process.exit(failed ? 1 : 0);
