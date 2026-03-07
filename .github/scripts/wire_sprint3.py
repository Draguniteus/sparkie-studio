#!/usr/bin/env python3
"""Sprint 3 wiring patch - runs in GitHub Actions."""

with open('src/app/api/chat/route.ts', 'r', encoding='utf-8') as f:
    content = f.read()

original_size = len(content)
print(f"Original: {original_size} chars")

# PATCH 1 - add S3 imports after S2 imports
OLD_IMPORT = "import { executeSprint2Tool } from '@/lib/sprint2-cases'"
NEW_IMPORT = (
    "import { executeSprint2Tool } from '@/lib/sprint2-cases'\n"
    "import { SPARKIE_TOOLS_S3 } from '@/lib/sprint3-tools'\n"
    "import { executeSprint3Tool } from '@/lib/sprint3-cases'"
)
assert OLD_IMPORT in content, "PATCH1 anchor not found"
content = content.replace(OLD_IMPORT, NEW_IMPORT, 1)
print("PATCH 1 OK")

# PATCH 2 - spread S3 after S2 in tools array
OLD_SPREAD = "  ...SPARKIE_TOOLS_S2,\n]"
NEW_SPREAD = "  ...SPARKIE_TOOLS_S2,\n  ...SPARKIE_TOOLS_S3,\n]"
assert OLD_SPREAD in content, "PATCH2 S2 spread not found"
content = content.replace(OLD_SPREAD, NEW_SPREAD, 1)
print("PATCH 2 OK")

# PATCH 3 - chain S3 in default case
OLD_DEFAULT = (
    "        const s2result = await executeSprint2Tool(name, args, userId)\n"
    "        if (s2result !== null) return s2result\n"
    "        if (userId) {"
)
NEW_DEFAULT = (
    "        const s2result = await executeSprint2Tool(name, args, userId)\n"
    "        if (s2result !== null) return s2result\n"
    "        const s3result = await executeSprint3Tool(name, args, userId, baseUrl)\n"
    "        if (s3result !== null) return s3result\n"
    "        if (userId) {"
)
assert OLD_DEFAULT in content, "PATCH3 default case not found"
content = content.replace(OLD_DEFAULT, NEW_DEFAULT, 1)
print("PATCH 3 OK")

# PATCH 4 - hive labels
OLD_HIVE = '        text_to_speech: "Voice Synthesis Active",'
NEW_HIVE = (
    '        text_to_speech: "Voice Synthesis Active",\n'
    '        // Sprint 3\n'
    '        execute_script: "Script Engine Online",\n'
    '        npm_run: "npm Runner Active",\n'
    '        git_ops: "Git Ops Active",\n'
    '        delete_memory: "Memory Pruner Active",\n'
    '        run_tests: "Test Runner Active",\n'
    '        check_lint: "Lint Checker Active",'
)
assert OLD_HIVE in content, "PATCH4 hive anchor not found"
content = content.replace(OLD_HIVE, NEW_HIVE, 1)
print("PATCH 4 OK")

# PATCH 5 - chip labels
OLD_CHIP = "            transcribe_audio: 'Transcribing audio...', text_to_speech: 'Synthesizing speech...',\n          }"
NEW_CHIP = (
    "            transcribe_audio: 'Transcribing audio...', text_to_speech: 'Synthesizing speech...',\n"
    "            execute_script: 'Running script...', npm_run: 'Running npm...',\n"
    "            git_ops: 'Running git ops...', delete_memory: 'Pruning memory...',\n"
    "            run_tests: 'Running tests...', check_lint: 'Checking lint...',\n"
    "          }"
)
assert OLD_CHIP in content, "PATCH5 chip not found"
content = content.replace(OLD_CHIP, NEW_CHIP, 1)
print("PATCH 5 OK")

# PATCH 6 - worklog labels
OLD_WLOG = "            text_to_speech: 'Running the tool \u2014 text to speech',\n          }"
NEW_WLOG = (
    "            text_to_speech: 'Running the tool \u2014 text to speech',\n"
    "            execute_script: 'Running script',\n"
    "            npm_run: 'Running npm command',\n"
    "            git_ops: 'Running git operation',\n"
    "            delete_memory: 'Deleting memory entry',\n"
    "            run_tests: 'Running test suite',\n"
    "            check_lint: 'Running lint check',\n"
    "          }"
)
assert OLD_WLOG in content, "PATCH6 worklog not found"
content = content.replace(OLD_WLOG, NEW_WLOG, 1)
print("PATCH 6 OK")

# PATCH 7 - icon map
OLD_ICON = "            create_calendar_event: 'calendarToday', transcribe_audio: 'mic', text_to_speech: 'mic',\n          }"
NEW_ICON = (
    "            create_calendar_event: 'calendarToday', transcribe_audio: 'mic', text_to_speech: 'mic',\n"
    "            execute_script: 'code', npm_run: 'terminal', git_ops: 'git',\n"
    "            delete_memory: 'trash', run_tests: 'checkCircle', check_lint: 'alertCircle',\n"
    "          }"
)
assert OLD_ICON in content, "PATCH7 icon not found"
content = content.replace(OLD_ICON, NEW_ICON, 1)
print("PATCH 7 OK")

# Verify all insertions
checks = [
    "import { SPARKIE_TOOLS_S3 }",
    "import { executeSprint3Tool }",
    "...SPARKIE_TOOLS_S3,",
    "executeSprint3Tool(name, args, userId, baseUrl)",
    "execute_script: 'Running script...',",
    "check_lint: 'alertCircle',",
    "run_tests: 'Running test suite',",
]
for c in checks:
    assert c in content, f"VERIFY FAILED: {c}"

print(f"Final: {len(content)} chars ({len(content) - original_size:+d})")

with open('src/app/api/chat/route.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print("SUCCESS: route.ts patched and saved")
