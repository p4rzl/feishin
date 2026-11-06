/* eslint-disable @typescript-eslint/explicit-function-return-type */
// Run: node scripts/test-fork.mjs. No downloads or desktop installation performed.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const project = await import(
    `data:text/javascript,${encodeURIComponent(read('src/shared/constants/project.ts'))}`
);
const pkg = JSON.parse(read('package.json'));
assert.equal(pkg.homepage, project.PROJECT_URL);
assert.equal(pkg.bugs.url, `${project.PROJECT_URL}/issues`);
for (const file of [
    'electron-builder.yml',
    'electron-builder-beta.yml',
    'electron-builder-alpha.yml',
]) {
    const publish = read(file).split('\npublish:\n')[1];
    assert.ok(publish.includes(`owner: ${project.PROJECT_GITHUB_OWNER}`), file);
    assert.ok(publish.includes(`repo: ${project.PROJECT_GITHUB_REPO}`), file);
    assert.ok(publish.includes('provider: github'), file);
}
assert.ok(!read('src/renderer/index.html').includes('umami.jeffvli.org'));

const profile = mkdtempSync(path.join(tmpdir(), 'feishin-fork-test-'));
const bin = path.join(profile, 'bin');
mkdirSync(bin);
for (const [name, source] of Object.entries({
    curl: `#!/usr/bin/env node
        const fs = require('node:fs'), path = require('node:path');
        const args = process.argv.slice(2);
        fs.appendFileSync(process.env.TEST_CURL_LOG, JSON.stringify(args) + '\\n');
        for (let i = 0; i < args.length; i++) if (args[i] === '-o') {
            const target = args[++i];
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, 'test artifact');
        }
        if (!args.includes('-o')) process.stdout.write('[Desktop Entry]\\n');
    `,
    sysctl: '#!/bin/sh\necho 1\n',
    uname: '#!/bin/sh\necho "$TEST_ARCH"\n',
})) {
    const file = path.join(bin, name);
    writeFileSync(file, source);
    chmodSync(file, 0o755);
}
for (const [machine, artifact] of [
    ['x86_64', 'x64'],
    ['aarch64', 'arm64'],
]) {
    const destination = path.join(profile, machine);
    mkdirSync(destination);
    const log = path.join(destination, 'requests.jsonl');
    execFileSync('sh', [path.join(root, 'install-feishin-appimage'), destination], {
        env: {
            ...process.env,
            PATH: `${bin}:${process.env.PATH}`,
            TEST_ARCH: machine,
            TEST_CURL_LOG: log,
            XDG_DATA_HOME: path.join(destination, 'share'),
        },
        stdio: 'pipe',
    });
    const requests = readFileSync(log, 'utf8');
    assert.ok(
        requests.includes(
            `${project.PROJECT_URL}/releases/latest/download/Feishin-linux-${artifact}.AppImage`,
        ),
    );
    assert.ok(!requests.includes('github.com/jeffvli/feishin'));
}
console.log(
    'Fork checks passed: release destinations, project links, analytics isolation and x64/ARM64 installer URLs.',
);
