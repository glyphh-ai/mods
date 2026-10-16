// The tools Claude calls (registered with $.tool.register): each one rrotor's
// local API through the mod (rrotor's docs/architecture.md, section 7).
export const TOOLS = [
  {
    name: 'programs_list',
    description: 'List the programs deployed in rrotor (this machine\'s runtime): each one\'s functions, versions and the active version.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'program_deploy',
    description:
      'Deploy a program to rrotor at one commit: a folder on this machine that is a git repo with glyphh.json and program.py at its root ' +
      '(path, absolute; commit, default HEAD: commit first), or a GitHub repo (owner/name) and its commit. Answers its program, version and commit.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The program folder (absolute path)' },
        commit: { type: 'string', description: 'The commit to deploy (default HEAD)' },
        repo: { type: 'string', description: 'owner/name on GitHub, instead of a folder' },
      },
    },
  },
  {
    name: 'program_call',
    description:
      'Run a program\'s function in rrotor\'s sandbox and answer its Result: done (data), needs_input (prompt, a value or a choice), ' +
      'needs_approval (step and prompt: ask the person, then program_continue with {"approved": true|false}), or failed (step, reason).',
    inputSchema: {
      type: 'object',
      properties: {
        program: { type: 'string' },
        function: { type: 'string', description: 'Default start' },
        inputs: { type: 'object', description: 'The function\'s inputs, as its manifest describes them' },
        version: { type: 'number', description: 'A deployed version; default the active one' },
      },
      required: ['program'],
    },
  },
  {
    name: 'program_continue',
    description:
      'Answer a waiting run and answer its next Result: for needs_approval {"approved": true} or {"approved": false}, only as the person decided; ' +
      'for needs_input the value or choice.',
    inputSchema: { type: 'object', properties: { run_id: { type: 'string' }, answer: {} }, required: ['run_id', 'answer'] },
  },
  {
    name: 'run_status',
    description: 'A run\'s status, its last Result, its seconds and the last lines of its log.',
    inputSchema: { type: 'object', properties: { run_id: { type: 'string' } }, required: ['run_id'] },
  },
] as const

export type ToolName = (typeof TOOLS)[number]['name']
export const PREFIX = 'mcp__programs__'
