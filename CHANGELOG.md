# Changelog

All notable changes to the Aisaka 2021 Roblox Studio MCP Bridge & ZeroScript Extension are documented here.

## [1.5.5] - 2026-09-13

### Added
- **Stability & Performance Suite**:
  1. **HTTP Long-Polling**: Holds polling requests open for 2.5s on the server; dispatches instantly upon incoming tool calls while dropping HTTP traffic from 400 req/min down to ~24 req/min to eliminate Roblox HttpService rate limits.
  2. **Studio Heartbeat & Fast-Failure**: Tracks Studio heartbeat in real-time. Automatically rejects tool calls immediately with informative error if Studio is closed or loading, eliminating 25-second silent hangs.
  3. **Infinite-Loop Guard & Coroutine Watchdog**: Static AST-like scanner intercepts unyielding `while` / `repeat` loops before execution to protect Studio from freezing. Also executes code inside a monitored coroutine with an 8-second watchdog limit.
  4. **UTF-8 Sanitizer & Payload Capping**: Recursively sanitizes non-printable and invalid UTF-8 bytes to prevent `HttpService:JSONEncode()` crashes. Enforces a 750KB payload ceiling to stay comfortably beneath Roblox's 1MB HTTP POST limit.
- **New MCP Tool: `script_grep`**:
  - Global text and pattern search across every `Script`, `LocalScript`, and `ModuleScript` in the game.
  - Safe traversal restricting scans to user datamodel services to prevent `identity 5 lacks permission 6` permission errors.
  - Returns script paths, line numbers, and matching code lines.
- **New MCP Tool: `inspect_instance`**:
  - Deep property inspector for any instance in the game (parts, models, GUIs, sounds, values, humanoids, particles, etc.).
  - Extracts CFrames, Vector3 positions, Colors, Attributes, and CollectionService tags.

### Upgraded
- **ZeroScript Browser Extension v1.5.5**:
  - **DeepSeek Unified Model Support**: Added full support for DeepSeek's new unified model (where Instant, Expert, and Vision tabs are merged into one). Fixes "DeepSeek mode not ready" error on startup.
  - **DeepSeek Screenshot / Vision Support**: `screen_capture` now functions across every DeepSeek conversation.
  - **ChatGPT & Provider Improvements**: Incorporates upstream layout and streaming fixes for ChatGPT, Kimi, Gemini, Qwen, and Arena.

### Maintained & Verified
- **2021 Roblox Studio / Aisaka Revival Support**:
  - Maintained process detection for `AisakaStudio.exe` and `RobloxStudio.exe`.
  - Stdio MCP server routing to `node server.js` for native 2021 Luau execution via `MCPBridge2021.lua`.
  - Preserved tool aliases (`search_game_tree`, `script_read`, `multi_edit`, `screen_capture`, `get_tree`, `write_script`, etc.).
  - Auto-cleanup of stale listeners on ports 3021 and 17613.

---

## [1.5.4] - 2026-09-12

### Initial Release
- Complete 1:1 ZeroScript-compatible browser extension and bridge for 2021 Roblox Studio (Aisaka).
- Multi-AI client support: OpenCode, Claude Desktop, Cursor, Codex, Windsurf, and web chats (ChatGPT, DeepSeek, Claude).
- Studio plugin `MCPBridge2021.lua` with HTTP polling mechanism.
