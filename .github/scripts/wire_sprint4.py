#!/usr/bin/env python3
"""Sprint 4 wiring patch - runs in GitHub Actions."""

with open('src/app/api/chat/route.ts', 'r', encoding='utf-8') as f:
    content = f.read()

original_size = len(content)
print(f"Original: {original_size} chars")

# PATCH 1 - add S4 imports after S3 imports
OLD_IMPORT = "import { executeSprint3Tool } from '@/lib/sprint3-cases'"
NEW_IMPORT = (
    "import { executeSprint3Tool } from '@/lib/sprint3-cases'\n"
    "import { SPARKIE_TOOLS_S4 } from '@/lib/sprint4-tools'\n"
    "import { executeSprint4Tool } from '@/lib/sprint4-cases'"
)
assert OLD_IMPORT in content, "PATCH1 anchor not found"
content = content.replace(OLD_IMPORT, NEW_IMPORT, 1)
print("PATCH 1 OK")

# PATCH 2 - spread S4 after S3 in tools array
OLD_SPREAD = "  ...SPARKIE_TOOLS_S3,\n]"
NEW_SPREAD = "  ...SPARKIE_TOOLS_S3,\n  ...SPARKIE_TOOLS_S4,\n]"
assert OLD_SPREAD in content, "PATCH2 S3 spread not found"
content = content.replace(OLD_SPREAD, NEW_SPREAD, 1)
print("PATCH 2 OK")

# PATCH 3 - chain S4 in default case
OLD_DEFAULT = (
    "        const s3result = await executeSprint3Tool(name, args, userId, baseUrl)\n"
    "        if (s3result !== null) return s3result\n"
    "        if (userId) {"
)
NEW_DEFAULT = (
    "        const s3result = await executeSprint3Tool(name, args, userId, baseUrl)\n"
    "        if (s3result !== null) return s3result\n"
    "        const s4result = await executeSprint4Tool(name, args, userId, baseUrl, executeConnectorTool)\n"
    "        if (s4result !== null) return s4result\n"
    "        if (userId) {"
)
assert OLD_DEFAULT in content, "PATCH3 default case not found"
content = content.replace(OLD_DEFAULT, NEW_DEFAULT, 1)
print("PATCH 3 OK")

# PATCH 4 - hive labels
OLD_HIVE = '        check_lint: "Lint Checker Active",'
NEW_HIVE = (
    '        check_lint: "Lint Checker Active",\n'
    '        // Sprint 4\n'
    '        read_email_thread: "Mail Reader Active",\n'
    '        manage_email: "Mail Manager Active",\n'
    '        rsvp_event: "Calendar RSVP Active",\n'
    '        manage_calendar_event: "Calendar Manager Active",\n'
    '        analyze_file: "File Analyst Active",\n'
    '        fetch_url: "Web Reader Active",\n'
    '        research: "Research Engine Active",'
)
assert OLD_HIVE in content, "PATCH4 hive anchor not found"
content = content.replace(OLD_HIVE, NEW_HIVE, 1)
print("PATCH 4 OK")

# PATCH 5 - chip labels
OLD_CHIP = "            run_tests: 'Running tests...', check_lint: 'Checking lint...',\n          }"
NEW_CHIP = (
    "            run_tests: 'Running tests...', check_lint: 'Checking lint...',\n"
    "            read_email_thread: 'Reading thread...', manage_email: 'Managing email...',\n"
    "            rsvp_event: 'Sending RSVP...', manage_calendar_event: 'Updating calendar...',\n"
    "            analyze_file: 'Analyzing file...', fetch_url: 'Fetching URL...', research: 'Researching...',\n"
    "          }"
)
assert OLD_CHIP in content, "PATCH5 chip not found"
content = content.replace(OLD_CHIP, NEW_CHIP, 1)
print("PATCH 5 OK")

# PATCH 6 - worklog labels
OLD_WLOG = "            check_lint: 'Running lint check',\n          }"
NEW_WLOG = (
    "            check_lint: 'Running lint check',\n"
    "            read_email_thread: 'Reading email thread',\n"
    "            manage_email: 'Managing email',\n"
    "            rsvp_event: 'RSVPing to event',\n"
    "            manage_calendar_event: 'Managing calendar event',\n"
    "            analyze_file: 'Analyzing file',\n"
    "            fetch_url: 'Fetching URL',\n"
    "            research: 'Researching topic',\n"
    "          }"
)
assert OLD_WLOG in content, "PATCH6 worklog not found"
content = content.replace(OLD_WLOG, NEW_WLOG, 1)
print("PATCH 6 OK")

# PATCH 7 - icon map
OLD_ICON = "            delete_memory: 'trash', run_tests: 'checkCircle', check_lint: 'alertCircle',\n          }"
NEW_ICON = (
    "            delete_memory: 'trash', run_tests: 'checkCircle', check_lint: 'alertCircle',\n"
    "            read_email_thread: 'mail', manage_email: 'mail', rsvp_event: 'calendar',\n"
    "            manage_calendar_event: 'calendar', analyze_file: 'file', fetch_url: 'globe', research: 'search',\n"
    "          }"
)
assert OLD_ICON in content, "PATCH7 icon not found"
content = content.replace(OLD_ICON, NEW_ICON, 1)
print("PATCH 7 OK")

# Verify
checks = [
    "import { SPARKIE_TOOLS_S4 }",
    "import { executeSprint4Tool }",
    "...SPARKIE_TOOLS_S4,",
    "executeSprint4Tool(name, args, userId, baseUrl, executeConnectorTool)",
    "read_email_thread: 'Reading thread...',",
    "research: 'search',",
    "research: 'Researching topic',",
]
for c in checks:
    assert c in content, f"VERIFY FAILED: {c}"

print(f"Final: {len(content)} chars ({len(content) - original_size:+d})")

with open('src/app/api/chat/route.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print("SUCCESS: route.ts patched and saved")
