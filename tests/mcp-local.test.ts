import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import {
  extractMcpEnvKeys,
  buildMcpLocalTemplate,
  scaffoldMcpLocalConfig,
  mcpRequiresLocalConfig,
  ensureMcpLocalGitignore,
  gitignoreIncludesMcpLocalAsync,
  countEmptyMcpLocalValues,
  isMcpLocalGitignoredLine,
} from '../src/utils/mcp-local.js';

describe('mcp-local utilities', () => {
  it('extracts placeholder env keys from mcpData', () => {
    const data = {
      env: {
        API_KEY: '${API_KEY}',
        SECRET: '{{SECRET}}',
        PORT: 8080,
        STATIC: 'plain-value',
        EMPTY: '',
      },
      mcpServers: {
        github: {
          env: {
            GITHUB_TOKEN: '$GITHUB_TOKEN',
            GH_HOST: 'github.com',
          },
        },
      },
    };

    const keys = extractMcpEnvKeys(data);
    assert.deepEqual(keys, ['API_KEY', 'EMPTY', 'GITHUB_TOKEN', 'SECRET']);
    assert.equal(mcpRequiresLocalConfig(data), true);
  });

  it('builds template with comment and empty keys', () => {
    const template = buildMcpLocalTemplate(['FOO', 'BAR']);
    assert.equal(typeof template._comment, 'string');
    assert.equal(template.FOO, '');
    assert.equal(template.BAR, '');
  });

  it('detects gitignored lines with standard and wildcard patterns', () => {
    assert.equal(isMcpLocalGitignoredLine('mcps/**/mcp.local.json'), true);
    assert.equal(isMcpLocalGitignoredLine('**/mcp.local.json'), true);
    assert.equal(isMcpLocalGitignoredLine('mcp.local.json'), true);
    assert.equal(isMcpLocalGitignoredLine('*.local.json'), true);
    assert.equal(isMcpLocalGitignoredLine('**/*.local.json'), true);
    assert.equal(isMcpLocalGitignoredLine('/mcps/**/mcp.local.json'), true);
    assert.equal(isMcpLocalGitignoredLine('# mcps/**/mcp.local.json'), false);
    assert.equal(isMcpLocalGitignoredLine(''), false);
    assert.equal(isMcpLocalGitignoredLine('node_modules'), false);
  });

  it('scaffolds mcp.local.json in asset directory and counts empty values', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aman-test-mcp-'));
    try {
      const mcpJsonPath = path.join(tmpDir, 'mcp.json');
      await fs.writeFile(
        mcpJsonPath,
        JSON.stringify({
          env: {
            API_KEY: '${API_KEY}',
            ENDPOINT: 'https://api.example.com',
          },
        }),
        'utf-8'
      );

      const result = await scaffoldMcpLocalConfig(tmpDir);
      assert.equal(result.created, true);
      assert.deepEqual(result.keys, ['API_KEY']);

      const repeat = await scaffoldMcpLocalConfig(tmpDir);
      assert.equal(repeat.created, false);

      const emptyCount = await countEmptyMcpLocalValues(tmpDir);
      assert.equal(emptyCount, 1);

      const localJsonPath = path.join(tmpDir, 'mcp.local.json');
      await fs.writeFile(
        localJsonPath,
        JSON.stringify({
          _comment: 'test',
          API_KEY: 'secret-token-123',
        }),
        'utf-8'
      );
      const filledCount = await countEmptyMcpLocalValues(tmpDir);
      assert.equal(filledCount, 0);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('ensures and checks .gitignore inclusion without duplicates', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aman-test-git-'));
    try {
      assert.equal(await gitignoreIncludesMcpLocalAsync(tmpDir), false);

      const added = await ensureMcpLocalGitignore(tmpDir);
      assert.equal(added, true);
      assert.equal(await gitignoreIncludesMcpLocalAsync(tmpDir), true);

      const addedAgain = await ensureMcpLocalGitignore(tmpDir);
      assert.equal(addedAgain, false);

      const customDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aman-test-custom-'));
      try {
        await fs.writeFile(path.join(customDir, '.gitignore'), '*.local.json\n', 'utf-8');
        assert.equal(await gitignoreIncludesMcpLocalAsync(customDir), true);
        const shouldNotAdd = await ensureMcpLocalGitignore(customDir);
        assert.equal(shouldNotAdd, false);
      } finally {
        await fs.rm(customDir, { recursive: true, force: true });
      }
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
