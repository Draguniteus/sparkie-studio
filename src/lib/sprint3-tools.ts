// Sprint 3 — P2 Tool Definitions
// Imported and spread into SPARKIE_TOOLS in route.ts

export const SPARKIE_TOOLS_S3 = [
  {
    type: 'function',
    function: {
      name: 'execute_script',
      description: 'Run a Node.js or Python script in the E2B sandbox. Use for complex computations, data transformations, or multi-step code tasks that are easier to express as a script than a terminal command.',
      parameters: {
        type: 'object',
        properties: {
          language: { type: 'string', description: 'Script language: "node" (default) or "python"' },
          code: { type: 'string', description: 'The script code to execute' },
          timeout: { type: 'number', description: 'Optional timeout in seconds (default 30, max 120)' },
        },
        required: ['code'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'npm_run',
      description: 'Run an npm script (e.g. build, test, lint) or install packages in the E2B sandbox against the sparkie-studio repo. Use to verify a build locally before committing, or to run scripts from package.json.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'npm command to run, e.g. "build", "test", "install <pkg>", "audit"' },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_ops',
      description: 'Perform GitHub repository operations: list branches, create/delete branches, compare commits, or get commit details. Use for branch management and code history inspection.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', description: '"list_branches" | "create_branch" | "delete_branch" | "get_commit" | "compare"' },
          branch: { type: 'string', description: 'Branch name (for create/delete/create_branch)' },
          from_branch: { type: 'string', description: 'Base branch for create_branch (default: master)' },
          base: { type: 'string', description: 'Base ref for compare (e.g. SHA or branch name)' },
          head: { type: 'string', description: 'Head ref for compare' },
          sha: { type: 'string', description: 'Commit SHA for get_commit' },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_memory',
      description: "Delete a specific memory from Sparkie's self-memory store (sparkie_self_memory table). Use to remove stale, incorrect, or outdated self-knowledge that would otherwise pollute future context.",
      parameters: {
        type: 'object',
        properties: {
          memory_id: { type: 'string', description: 'ID of the memory entry to delete (from sparkie_self_memory.id)' },
        },
        required: ['memory_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_tests',
      description: 'Run the test suite in the E2B sandbox against the sparkie-studio repo. Returns pass/fail counts and any error output. Use to validate code changes before deploying.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Optional test file pattern or test name filter to run a subset of tests' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_lint',
      description: 'Run ESLint and TypeScript type-checking on the sparkie-studio repo in the E2B sandbox. Returns lint errors and type errors. Use before committing to catch issues early.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Optional: restrict lint to a specific file or directory, e.g. "src/lib/sprint3-cases.ts"' },
        },
        required: [],
      },
    },
  },
] as const
