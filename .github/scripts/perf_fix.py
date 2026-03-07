#!/usr/bin/env python3
"""Performance fixes + model correction for route.ts.

Fix 1: Connector tools in-memory cache (2-min TTL)
Fix 2: getAwareness UPDATE fire-and-forget
Fix 3: getProjectContext skipped entirely
Fix 4: flamePlan model openai-gpt-4.1 -> MODELS.CAPABLE
"""

with open('src/app/api/chat/route.ts', 'r', encoding='utf-8') as f:
    content = f.read()

original_size = len(content)
print(f'Original: {original_size:,} chars')

# FIX 1a
OLD = 'const _rlMap = new Map<string, { count: number; resetAt: number }>()'
assert OLD in content, 'FIX1a MISSING'
content = content.replace(OLD,
    '// \u2500\u2500 Connector-tools TTL cache \u2014 avoids live Composio API call on every request \u2500\u2500\n'
    '// eslint-disable-next-line @typescript-eslint/no-explicit-any\n'
    'const _ctCache = new Map<string, { tools: any[]; expiresAt: number }>()\n\n' + OLD, 1)
print('FIX1a OK')

# FIX 1b
OLD = (
    'async function getUserConnectorTools(userId: string): Promise<Array<{\n'
    '  type: string\n'
    '  function: { name: string; description: string; parameters: Record<string, unknown> }\n'
    '}>> {\n'
    '  try {'
)
assert OLD in content, 'FIX1b MISSING'
content = content.replace(OLD,
    'async function getUserConnectorTools(userId: string): Promise<Array<{\n'
    '  type: string\n'
    '  function: { name: string; description: string; parameters: Record<string, unknown> }\n'
    '}>> {\n'
    '  const cached = _ctCache.get(userId)\n'
    '  if (cached && cached.expiresAt > Date.now()) return cached.tools\n'
    '  try {',
    1
)
print('FIX1b OK')

# FIX 1c
fn_idx = content.find('async function getUserConnectorTools(')
fn_end = content.find('\nasync function ', fn_idx + 1)
fn_body = content[fn_idx:fn_end]
OLD_RET = '    return tools\n  } catch { return [] }\n}'
assert OLD_RET in fn_body, f'FIX1c MISSING'
NEW_RET = '    _ctCache.set(userId, { tools, expiresAt: Date.now() + 2 * 60 * 1000 })\n    return tools\n  } catch { return [] }\n}'
content = content[:fn_idx] + fn_body.replace(OLD_RET, NEW_RET, 1) + content[fn_end:]
print('FIX1c OK')

# FIX 2
OLD = "      await query('UPDATE user_sessions SET last_seen_at = NOW(), session_count = session_count + 1 WHERE user_id = $1', [userId])"
assert OLD in content, 'FIX2 MISSING'
content = content.replace(OLD,
    "      void query('UPDATE user_sessions SET last_seen_at = NOW(), session_count = session_count + 1 WHERE user_id = $1', [userId]).catch(() => {})",
    1)
print('FIX2 OK')

# FIX 3
OLD = "      const projectCtx = await getProjectContext(userId, 'Draguniteus/sparkie-studio')"
assert OLD in content, 'FIX3 MISSING'
content = content.replace(OLD,
    '      // Skipped: getProjectContext not used in system prompt \u2014 saves one extra fetch per request\n'
    '      const projectCtx: string | null = null',
    1)
print('FIX3 OK')

# FIX 4
OLD = "                model: 'openai-gpt-4.1',"
assert OLD in content, 'FIX4 MISSING'
content = content.replace(OLD,
    '                model: MODELS.CAPABLE, // was openai-gpt-4.1 (tier-blocked) \u2014 Flame handles planning',
    1)
print('FIX4 OK')

# Verify
checks = [
    '_ctCache',
    'cached.expiresAt > Date.now()) return cached.tools',
    '_ctCache.set(userId, { tools, expiresAt:',
    "void query('UPDATE user_sessions",
    'const projectCtx: string | null = null',
    'model: MODELS.CAPABLE, // was openai-gpt-4.1',
]
for c in checks:
    assert c in content, f'VERIFY FAILED: {c}'

print(f'\nFinal: {len(content):,} chars ({len(content) - original_size:+d})')

with open('src/app/api/chat/route.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print('SUCCESS: all 4 fixes applied and saved')
