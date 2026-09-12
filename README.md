# 2021 Roblox Studio MCP Bridge 🎮🤖

Connect AI coding assistants (**OpenCode**, **Claude Desktop / Claude Code**, **Cursor**, **ChatGPT**) directly to **2021 Roblox Studio** using Anthropic's **Model Context Protocol (MCP)**.

---

## 🌟 Why This Exists

Modern Roblox Studio builds include an internal `StudioMCP.exe`, but older versions of Roblox Studio (such as the 2021 engine builds) do not have built-in MCP support and cannot run modern Luau syntax.

This project provides a complete, retro-compatible MCP bridge:
- **`MCPBridge2021.lua`**: A Studio plugin written specifically for 2021 Luau/Lua 5.1 (compatible with older iteration syntax, `ChangeHistoryService:SetWaypoint`, and HTTP long-polling).
- **`server.js`**: A lightweight Node.js daemon that connects via Model Context Protocol (`stdio`) to your AI client while bridging commands to Roblox Studio via a local HTTP daemon.

---

## 📦 Project Contents

| File | Description |
| :--- | :--- |
| `MCPBridge2021.lua` | Roblox Studio plugin script (place in your Studio Plugins folder). |
| `server.js` | Local Node.js MCP server & HTTP bridge daemon. |
| `package.json` | Project dependencies (`@modelcontextprotocol/sdk`, `express`, `cors`, `uuid`). |
| `SETUP.txt` | Quick plain-text notepad instructions. |

---

## 🚀 Quick Setup Guide

### 1. Install the Studio Plugin
1. Open Windows Run (`Win + R`), type:
   ```text
   %localappdata%\Roblox\Plugins
   ```
   and press **Enter**.
2. Copy **`MCPBridge2021.lua`** into that folder.
3. Open **2021 Roblox Studio**.
4. Go to **Game Settings** > **Security** and turn ON **Allow HTTP Requests** (or run `game:GetService("HttpService").HttpEnabled = true` in the Command Bar).
5. Check your Output window in Studio; you should see:
   ```text
   [MCP 2021] Bridge initialized. Connecting to http://127.0.0.1:3021 ...
   ```

---

### 2. Install MCP Server Dependencies
Open your terminal (PowerShell or Command Prompt) in the repository folder and run:

```bash
npm install
```

---

### 3. Connect to Your AI Client

#### Option A: OpenCode
Add this to your `opencode.json` (or `~/.config/opencode/opencode.jsonc`):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "Roblox_2021": {
      "type": "local",
      "command": ["node", "C:/path/to/server.js"],
      "enabled": true
    }
  }
}
```

#### Option B: Claude Desktop
Add this to `%APPDATA%\Claude\claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "roblox-2021": {
      "command": "node",
      "args": ["C:/path/to/server.js"]
    }
  }
}
```

#### Option C: Cursor / Claude Code CLI
```bash
claude mcp add roblox-2021 -- node "C:/path/to/server.js"
```

---

## 🛠 Available Tools for the AI

| Tool | Description |
| :--- | :--- |
| `execute_luau` | Executes arbitrary Luau code in Studio's edit context with undo waypoint tracking. |
| `get_tree` | Traverses and returns the DataModel hierarchy (`game.Workspace`, `game.StarterGui`, etc.). |
| `read_script` | Reads the complete `.Source` text of any Script, LocalScript, or ModuleScript. |
| `write_script` | Writes or overwrites the `.Source` of any script with automatic undo checkpoints. |
| `create_instance` | Creates new instances (`Part`, `Model`, `ScreenGui`, etc.) with initial properties. |
| `delete_instance` | Destroys instances in the DataModel safely. |
| `get_output_log` | Retrieves recent output log messages from Studio. |

---

## 📄 License
MIT License
