#!/usr/bin/env python3
"""
Fix TS2345: CONVERSATIONAL fast-path Promise.resolve([]) returns never[] which
is not assignable to IdentityFiles. Fix all 5 typed returns:
  - loadIdentityFiles   -> Promise.resolve({} as IdentityFiles)
  - buildEnvCtx         -> Promise.resolve('')
  - readSessionSnapshot -> Promise.resolve(null)  [already correct]
  - loadReadyDeferredIntents -> already correct (never[] is assignable to array type)
  - getUserModel        -> already correct (never[] but handled)

Also add IdentityFiles to the import from @/lib/identity.
"""
import sys

path = 'src/app/api/chat/route.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()
original = content

# Fix 1: Add IdentityFiles to the import
OLD_IMPORT = "import { loadIdentityFiles, buildIdentityBlock, updateSessionFile, updateContextFile, updateActionsFile } from '@/lib/identity'"
NEW_IMPORT = "import { loadIdentityFiles, buildIdentityBlock, updateSessionFile, updateContextFile, updateActionsFile, type IdentityFiles } from '@/lib/identity'"
assert OLD_IMPORT in content, f'Import anchor not found'
content = content.replace(OLD_IMPORT, NEW_IMPORT, 1)
print('Fix 1: Added IdentityFiles type import')

# Fix 2: Replace Promise.resolve([]) for loadIdentityFiles with typed empty object
OLD_ID = "modelSelection.tier === 'conversational' ? Promise.resolve([]) : loadIdentityFiles(userId),"
NEW_ID = "modelSelection.tier === 'conversational' ? Promise.resolve({ user: '', memory: '', session: '', heartbeat: '', context: '', actions: '', snapshot: '' } as IdentityFiles) : loadIdentityFiles(userId),"
assert OLD_ID in content, f'IdentityFiles fast-path anchor not found'
content = content.replace(OLD_ID, NEW_ID, 1)
print('Fix 2: IdentityFiles fast-path -> typed empty object')

# Fix 3: Promise.resolve([]) for loadReadyDeferredIntents is fine (array),
# but let's be explicit with the right empty type
OLD_INTENTS = "modelSelection.tier === 'conversational' ? Promise.resolve([]) : loadReadyDeferredIntents(userId),"
NEW_INTENTS = "modelSelection.tier === 'conversational' ? Promise.resolve([] as Awaited<ReturnType<typeof loadReadyDeferredIntents>>) : loadReadyDeferredIntents(userId),"
if OLD_INTENTS in content:
    content = content.replace(OLD_INTENTS, NEW_INTENTS, 1)
    print('Fix 3: loadReadyDeferredIntents fast-path typed')
else:
    print('Fix 3: skipped (anchor not found - may already be correct)')

if content == original:
    print('ERROR: No changes made - all anchors failed')
    sys.exit(1)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print(f'Done. {len(content):,} chars written.')
