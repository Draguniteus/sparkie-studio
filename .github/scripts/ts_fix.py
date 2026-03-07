#!/usr/bin/env python3
"""Remove dead projectCtx if-block that causes TS2339 type error."""

with open('src/app/api/chat/route.ts', 'r', encoding='utf-8') as f:
    content = f.read()

original_size = len(content)
print(f'Original: {original_size:,} chars')

OLD = (
    '      // Inject project context (Phase 3 residual) \u2014 if repo was ingested, add structural awareness\n'
    '      // Skipped: getProjectContext not used in system prompt \u2014 saves one extra fetch per request\n'
    '      const projectCtx: string | null = null\n'
    '      if (projectCtx) {\n'
    '        // Auto-refresh if stale (> 2 hours)\n'
    '        const ageMs = Date.now() - new Date(projectCtx.lastIngestedAt).getTime()\n'
    '        if (ageMs < 2 * 60 * 60 * 1000) {\n'
    "          systemContent += '\\n\\n' + formatProjectContextBlock(projectCtx)\n"
    '        }\n'
    '      }\n'
)

NEW = '      // getProjectContext skipped \u2014 not used in system prompt (perf fix)\n'

assert OLD in content, f'ANCHOR NOT FOUND: {repr(OLD[:80])}'
content = content.replace(OLD, NEW, 1)

assert 'projectCtx.lastIngestedAt' not in content, 'Still has bad reference'
assert 'const projectCtx' not in content, 'Still has dead declaration'

print(f'Final: {len(content):,} chars ({len(content) - original_size:+d})')

with open('src/app/api/chat/route.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print('SUCCESS')
