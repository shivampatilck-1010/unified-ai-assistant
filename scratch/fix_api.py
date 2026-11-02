with open("apps/web/src/lib/api.ts", "r", encoding="utf-8") as f:
    lines = f.readlines()

start_idx = None
end_idx = None
for i, line in enumerate(lines):
    if "export async function pauseBrowserTask" in line:
        start_idx = i
    if "export async function fetchBrowserTaskScreenshot" in line:
        for j in range(i, len(lines)):
            if lines[j].strip() == "}":
                end_idx = j + 1
                break
        break

print(f"Replacing lines {start_idx} to {end_idx}")

part1 = "${API_BASE}/api/browser/tasks/${encodeURIComponent(taskId)}/pause"
part2 = "${response.status}"
part3 = "${API_BASE}/api/browser/tasks/${encodeURIComponent(taskId)}/resume"
part4 = "${API_BASE}/api/browser/tasks/${encodeURIComponent(taskId)}/screenshot"

code = f"""
export async function pauseBrowserTask(taskId: string, signal?: AbortSignal): Promise<BrowserTask> {{
  const response = await fetch(`{part1}`, {{
    method: 'POST',
    signal,
    headers: {{ 'Content-Type': 'application/json', Accept: 'application/json' }},
  }});
  if (!response.ok) {{
    throw new Error(`Failed to pause task: {part2}`);
  }}
  return safeParseJson<BrowserTask>(response);
}}

export async function resumeBrowserTask(taskId: string, signal?: AbortSignal): Promise<BrowserTask> {{
  const response = await fetch(`{part3}`, {{
    method: 'POST',
    signal,
    headers: {{ 'Content-Type': 'application/json', Accept: 'application/json' }},
  }});
  if (!response.ok) {{
    throw new Error(`Failed to resume task: {part2}`);
  }}
  return safeParseJson<BrowserTask>(response);
}}

export async function fetchBrowserTaskScreenshot(
  taskId: string,
  signal?: AbortSignal
): Promise<{{ screenshot_data_url: string | null; url?: string }}> {{
  const response = await fetch(`{part4}`, {{
    signal,
    headers: {{ Accept: 'application/json' }},
  }});
  if (!response.ok) {{
    return {{ screenshot_data_url: null }};
  }}
  return safeParseJson<{{ screenshot_data_url: string | null; url?: string }}>(response);
}}
"""

new_lines = lines[:start_idx] + [code] + lines[end_idx:]
with open("apps/web/src/lib/api.ts", "w", encoding="utf-8") as f:
    f.writelines(new_lines)
print("SUCCESS!")
