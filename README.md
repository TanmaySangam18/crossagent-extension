# Crossagent.si — Chrome Extension

> Type `@claude`, `@gemini`, or `@all` inside any AI chat. Silent prompt injection scanning across Claude, ChatGPT, Gemini, and 4 more — no tab switching, no API keys, no repeating yourself.

**v2.9.0** · [crossagentsi.vercel.app](https://crossagentsi.vercel.app) · [Live demo (no signup)](https://crossagentsi.vercel.app/demo)

---

## What it does

**Two things in one:**

1. **Cognitive Firewall** — detects prompt injection attempts in real time before they reach your AI. 8 attack vectors, OWASP LLM01 2026 aligned.
2. **Engram memory layer** — remembers facts, preferences, and context across every session on every AI platform.

> Palo Alto Networks (Nov 2026): 99% of AI is ungoverned. 40% of orgs can't reconstruct what their agents did. Unit 42 found 22 novel injection techniques in live production. This extension addresses both.

---

## Features

- **Silent injection scanning** — every message scanned before it's sent. Red badge appears if score ≥ 20.
- **Native routing** — uses your own logged-in accounts. No API key. No token limits.
- **7 platforms** — Claude, ChatGPT, Gemini, Perplexity, Grok, Mistral, Copilot
- **@all broadcast** — asks every agent simultaneously, synthesized into one answer via Claude
- **Cross-session memory** — Engram stores facts and preferences, injects relevant context before every message
- **Agent Roles** — assign Writer, Coder, Researcher, Analyst to each AI. Role injected as system context.

---

## Install

No Chrome Web Store listing yet ($5 fee pending). Load unpacked:

1. Download the latest release zip from the [Releases page](../../releases)
2. Unzip the file
3. Open Chrome → `chrome://extensions`
4. Enable **Developer mode** (top right)
5. Click **Load unpacked** → select the unzipped folder

**Get your API key:** Sign up at [crossagentsi.vercel.app](https://crossagentsi.vercel.app/dashboard) → copy your `eng_` key → paste into the extension popup.

---

## Usage

### Cross-agent routing
Type `@claude`, `@gemini`, `@chatgpt`, `@grok`, `@perplexity`, `@mistral`, `@copilot`, or `@all` at the start of any message inside any AI chat. The target AI must be open in a browser tab.

| Command | What happens |
|---------|-------------|
| `@claude tell me...` | Routes to Claude natively |
| `@all summarize this` | Broadcasts to all 7 AIs, synthesizes into one answer |
| `@chatgpt write a...` | Routes to ChatGPT natively |

### Keyboard shortcut
**Alt+Shift+C** — toggle the Crossagent sidebar panel

### Injection scanner
Every outgoing message is scanned automatically. If the risk score is ≥ 20, a warning appears before you send. You can override and send anyway.

**Scan verdicts:**

| Score | Verdict |
|-------|---------|
| 0 | clean |
| 1–19 | suspicious |
| 20–49 | likely_injection |
| 50+ | definite_injection |

**8 attack vectors detected:**
- `instruction_override` — "ignore previous instructions"
- `role_hijacking` — "you are now DAN / act as..."
- `context_extraction` — attempts to leak system prompt
- `data_exfiltration` — tries to extract sensitive data
- `encoded_payload` — base64 / obfuscated attack strings
- `urgency_manipulation` — false urgency to bypass guardrails
- `chain_injection` — multi-step injection sequences
- `indirect_injection` — injection embedded in retrieved content

---

## Requirements

- Chrome or Chromium-based browser
- An `eng_` API key from [crossagentsi.vercel.app](https://crossagentsi.vercel.app/dashboard) (free tier: 200 memory calls/month)
- Target AI tabs must be open and logged in for native routing

---

## Also available

| Method | Link |
|--------|------|
| npm SDK | `npm i @tanmaysangam018/crossagent` |
| MCP server | `https://backend-wine-phi-85.vercel.app/mcp` |
| Live demo | [crossagentsi.vercel.app/demo](https://crossagentsi.vercel.app/demo) |
| Web dashboard | [crossagentsi.vercel.app/dashboard](https://crossagentsi.vercel.app/dashboard) |

---

## License

Business Source License 1.1 (BSL 1.1). Free for personal use and open-source projects.

---

## Links

- Product: [crossagentsi.vercel.app](https://crossagentsi.vercel.app)
- Twitter: [@SangamTanmay](https://x.com/SangamTanmay)
- npm: [@tanmaysangam018/crossagent](https://www.npmjs.com/package/@tanmaysangam018/crossagent)
