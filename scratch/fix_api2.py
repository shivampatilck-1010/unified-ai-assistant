with open("apps/web/src/lib/api.ts", "r", encoding="utf-8") as f:
    text = f.read()

bad = """  return safeParseJson<{ screenshot_data_url: string | null; url?: string }>(response);
}
  return safeParseJson<{ screenshot_data_url: string | null; url?: string }>(response);
}
// =========================================="""

good = """  return safeParseJson<{ screenshot_data_url: string | null; url?: string }>(response);
}

// =========================================="""

text = text.replace(bad, good)
with open("apps/web/src/lib/api.ts", "w", encoding="utf-8") as f:
    f.write(text)
print("FIXED DUPLICATE!")
