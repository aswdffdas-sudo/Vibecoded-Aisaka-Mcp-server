# Changelog

All notable changes to the Aisaka 2021 Roblox Studio MCP Bridge & ZeroScript Extension are documented here.

## [1.5.5] - 2026-09-13

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
