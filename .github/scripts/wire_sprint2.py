#!/usr/bin/env python3
"""Sprint 2 wiring patch - runs in GitHub Actions."""

with open('src/app/api/chat/route.ts', 'r', encoding='utf-8') as f:
    content = f.read()

original_size = len(content)
print(f"Original: {original_size} chars")

OLD_IMPORT = "import { writeWorklog, writeMsgBatch } from '@/lib/worklog'"
NEW_IMPORT = (
    "import { writeWorklog, writeMsgBatch } from '@/lib/worklog'\n"
    "import { SPARKIE_TOOLS_S2 } from '@/lib/sprint2-tools'\n"
    "import { executeSprint2Tool } from '@/lib/sprint2-cases'"
)
assert OLD_IMPORT in content, "PATCH1 anchor not found"
content = content.replace(OLD_IMPORT, NEW_IMPORT, 1)
print("PATCH1: imports added")

idx = content.rfind("name: 'send_email'")
close_idx = content.find("  },\n]\n", idx)
assert close_idx > 0, "PATCH2 array close not found"
content = content[:close_idx] + "  },\n  ...SPARKIE_TOOLS_S2,\n]\n" + content[close_idx + len("  },\n]\n"):]
print("PATCH2: SPARKIE_TOOLS_S2 spread added")

OLD_DEFAULT = (
    "      default:\n"
    "        // Try as a connector action (user's connected apps)\n"
    "        if (userId) {\n"
    "          return await executeConnectorTool(name, args, userId)\n"
    "        }\n"
    "        return 'Tool not available: ' + name"
)
NEW_DEFAULT = (
    "      default: {\n"
    "        const s2result = await executeSprint2Tool(name, args, userId)\n"
    "        if (s2result !== null) return s2result\n"
    "        if (userId) {\n"
    "          return await executeConnectorTool(name, args, userId)\n"
    "        }\n"
    "        return 'Tool not available: ' + name\n"
    "      }"
)
assert OLD_DEFAULT in content, "PATCH3 default case not found"
content = content.replace(OLD_DEFAULT, NEW_DEFAULT, 1)
print("PATIH3: executeSprint2Tool dispatch added")

gct_idx = content.find('get_current_time: "')
assert gct_idx > 0, "PATCH4 hive anchor not found"
hive_close = content.find('      }\n      const pickHive', gct_idx)
assert hive_close > 0, "PATCH4 hive close not found"
insert_at = content.rfind('\n', 0, hive_close) + 1
sprint2_hive = (
    '        // Sprint 2\n'
    '        get_schema: "Schema Bee Active",\n'
    '        get_deployment_history: "Deployment Archives Accessed",\n'
    '        search_github: "Code Scout Deployed",\n'
    '        create_calendar_event: "Calendar Bee Queued",\n'
    '        transcribe_audio: "Transcription Bee Online",\n'
    '        text_to_speech: "Voice Synthesis Active",\n'
)
content = content[:insert_at] + sprint2_hive + content[insert_at:]
print("PATCH4O+\")

OLD_CHIP = "            send_email: 'Sending email...',\n          }"
NEW_CHIP = (
    "            send_email: 'Sending email...',\n"
    "            get_schema: 'Reading DB schema...', get_deployment_history: 'Pulling deploy history...',\n"
    "            search_github: 'Searching codebase...', create_calendar_event: 'Drafting calendar event...',\n"
    "            transcribe_audio: 'Transcribing audio...', text_to_speech: 'Synthesizing speech...',\n"
    "          }"
)
assert OLD_CHIP in content, "PATCH5 chip not found"
content = content.replace(OLD_CHIP, NEW_CHIP, 1)
print("PATCH5: CHIPLABELS: added")

OLD_WLOG = "            send_email: 'Running the tool \u2014 sending email',\n          }"
NEW_WLOG = (
    "            send_email: 'Running the tool \u2014 sending email',\n"
    "            get_schema: 'Reading database schema',\n"
    "            get_deployment_history: 'Pulling deployment history',\n"
    "            search_github: 'Searching the repository',\n"
    "            create_calendar_event: 'Drafting calendar event for approval',\n"
    "            transcribe_audio: 'Transcribing audio',\n"
    "            text_to_speech: 'Running the tool \u2014 text to speech',\n"
    "          }"
)
assert OLD_WLOG in content, "PATCH6 worklog not found"
content = content.replace(OLD_WLOG, NEW_WLOG, 1)
print("PATCH6: WORKLOG_STEP_LABELS added")

OLD_ICON = "            send_email: 'zap',\n          }"
NEW_ICON = (
    "            send_email: 'zap',\n"
    "            get_schema: 'database', get_deployment_history: 'rocket', search_github: 'search',\n"
    "            create_calendar_event: 'calendarToday', transcribe_audio: 'mic', text_to_speech: 'mic',\n"
    "          }"
)
assert OLD_ICON in content, "PATCH7 icon not found"
content = content.replace(OLD_ICON, NEW_ICON, 1)
print("PATCH0º stepIcon added")

checks = [
    "import { SPARKIE_TOOLS_S2 }",
    "import { executeSprint2Tool }",
    "...SPARKIE_TOOLS_S2",
    "executeSprint2Tool(name, args, userId)",
    "get_schema: 'Reading DB schema...'",
    "get_schema: 'database'",
]
for c in checks:
    assert c in content, f"VERIFY FAILED: {c}"

print(f"Final: {len(content)} chars ({len(content) - original_size:+d})")

with open('src/app/api/chat/route.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print("SUCCESS: route.ts patched and saved")
