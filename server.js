import express from "express";
import cors from "cors";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { v4 as uuidv4 } from "uuid";
import { execSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const PORT = 3021;
const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

// Queue of pending requests for the 2021 Roblox Studio plugin
const pendingRequests = new Map();

// Endpoint polled by 2021 Roblox Studio plugin
app.get("/poll", (req, res) => {
  for (const [id, reqData] of pendingRequests.entries()) {
    if (!reqData.inFlight) {
      reqData.inFlight = true;
      return res.json({
        id,
        tool: reqData.tool,
        args: reqData.args,
      });
    }
  }
  return res.status(204).end();
});

// Endpoint called by 2021 Roblox Studio plugin with execution results
app.post("/respond", (req, res) => {
  const { id, success, result, error } = req.body;
  const pending = pendingRequests.get(id);

  if (pending) {
    clearTimeout(pending.timeout);
    pendingRequests.delete(id);
    if (success) {
      pending.resolve(result);
    } else {
      pending.reject(new Error(error || "Execution failed in Roblox Studio"));
    }
  }
  res.json({ status: "ok" });
});

// REST API for web extensions
app.get("/api/status", (req, res) => {
  res.json({
    ok: true,
    server: "Aisaka 2021 Roblox Studio MCP",
    version: "1.5.5-retro",
    port: PORT,
    pending: pendingRequests.size,
  });
});

app.post("/api/call", async (req, res) => {
  const { tool, args } = req.body;
  if (!tool) return res.status(400).json({ success: false, error: "Missing 'tool'" });

  if (tool === "screen_capture") {
    try {
      const b64 = captureScreenBase64();
      return res.json({ success: true, tool, result: { imageBase64: b64 } });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  try {
    const result = await handleToolDispatch(tool, args || {});
    return res.json({ success: true, tool, result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

const httpListener = app.listen(PORT, "127.0.0.1", () => {
  console.error(`[Roblox 2021 MCP] HTTP bridge listening on http://127.0.0.1:${PORT}`);
});
httpListener.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`[Roblox 2021 MCP] Port ${PORT} already bound by active instance. Reusing bridge.`);
  } else {
    throw err;
  }
});

async function sendToStudio(tool, args, timeoutMs = 25000) {
  // If we are in secondary process where port was bound by another process, forward via localhost:3021
  if (!httpListener.listening) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/api/call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool, args }),
      });
      const data = await res.json();
      if (data.success) return data.result;
      throw new Error(data.error || "Forwarding call failed");
    } catch (e) {
      throw new Error("Bridge communication error: " + e.message);
    }
  }

  return new Promise((resolve, reject) => {
    const id = uuidv4();
    const timeout = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error(`Timeout waiting for Roblox Studio response on '${tool}'`));
    }, timeoutMs);

    pendingRequests.set(id, {
      tool,
      args,
      inFlight: false,
      resolve,
      reject,
      timeout,
    });
  });
}

// Native Windows Screen Capture Utility
function captureScreenBase64() {
  const outFile = path.join(os.tmpdir(), `studio_cap_${Date.now()}.b64`);
  const psScript = `
Add-Type -AssemblyName System.Drawing, System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinUser {
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
"@

$targetHwnd = [IntPtr]::Zero

$procs = Get-Process | Where-Object { 
    $_.ProcessName -eq "AisakaStudio" -or
    $_.ProcessName -like "*RobloxStudio*" -or
    $_.MainWindowTitle -like "*Roblox Studio*" -or 
    $_.MainWindowTitle -like "*Aisaka*"
}

if ($procs) {
    $proc = $procs[0]
    $targetHwnd = $proc.MainWindowHandle
    if ([WinUser]::IsIconic($targetHwnd)) {
        [WinUser]::ShowWindow($targetHwnd, 9) | Out-Null
        Start-Sleep -Milliseconds 200
    }
    [WinUser]::SetForegroundWindow($targetHwnd) | Out-Null
    Start-Sleep -Milliseconds 350
}

if ($targetHwnd -ne [IntPtr]::Zero) {
    $rect = New-Object WinUser+RECT
    [WinUser]::GetWindowRect($targetHwnd, [ref]$rect) | Out-Null
    $w = [Math]::Max(10, $rect.Right - $rect.Left)
    $h = [Math]::Max(10, $rect.Bottom - $rect.Top)
    
    $bmp = New-Object System.Drawing.Bitmap($w, $h)
    $gfx = [System.Drawing.Graphics]::FromImage($bmp)
    $gfx.CopyFromScreen($rect.Left, $rect.Top, 0, 0, (New-Object System.Drawing.Size($w, $h)))
    $gfx.Dispose()
} else {
    $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $bmp = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
    $gfx = [System.Drawing.Graphics]::FromImage($bmp)
    $gfx.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
    $gfx.Dispose()
}

$ms = New-Object System.IO.MemoryStream
$bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
$b64 = [Convert]::ToBase64String($ms.ToArray())
$ms.Dispose()

[System.IO.File]::WriteAllText("${outFile.replace(/\\/g, "\\\\")}", $b64)
`;

  const scriptPath = path.join(os.tmpdir(), `cap_${Date.now()}.ps1`);
  try {
    fs.writeFileSync(scriptPath, psScript, "utf-8");
    execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`, {
      timeout: 12000,
      windowsHide: true,
    });
    if (fs.existsSync(outFile)) {
      const b64 = fs.readFileSync(outFile, "utf-8").trim();
      return b64;
    }
    throw new Error("Screenshot output file not generated");
  } finally {
    try { fs.unlinkSync(scriptPath); } catch {}
    try { fs.unlinkSync(outFile); } catch {}
  }
}

// Tool Dispatch Handler with ZeroScript / Modern Aliases
async function handleToolDispatch(name, args) {
  if (name === "list_roblox_studios") {
    return {
      studios: [
        {
          id: "2021-studio",
          name: "2021 Roblox Studio (Aisaka)",
        },
      ],
    };
  }
  if (name === "get_studio_state") {
    return {
      datamodel_type: "Edit",
      play_state: "Edit",
      state: "Ready",
    };
  }
  if (name === "screen_capture") {
    const b64 = captureScreenBase64();
    return { imageBase64: b64 };
  }
  if (name === "search_game_tree") {
    return await sendToStudio("get_tree", {
      root: args.path || "game.Workspace",
      maxDepth: args.max_depth || args.maxDepth || 2,
    });
  }
  if (name === "script_read") {
    return await sendToStudio("read_script", {
      path: args.target_file || args.path,
    });
  }
  if (name === "multi_edit") {
    const filePath = args.file_path || args.path;
    const edits = args.edits || [];
    if (edits.length > 0 && edits[0].old_string === "") {
      return await sendToStudio("write_script", {
        path: filePath,
        source: edits[0].new_string,
      });
    }
    const current = await sendToStudio("read_script", { path: filePath });
    let updated = current;
    for (const edit of edits) {
      if (edit.replace_all) {
        updated = updated.split(edit.old_string).join(edit.new_string);
      } else {
        updated = updated.replace(edit.old_string, edit.new_string);
      }
    }
    return await sendToStudio("write_script", { path: filePath, source: updated });
  }

  return await sendToStudio(name, args);
}

// Setup Model Context Protocol (MCP) Server
const server = new Server(
  {
    name: "roblox-2021-studio",
    version: "1.5.5",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list_roblox_studios",
        description: "Lists connected 2021 Roblox Studio instances",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "get_studio_state",
        description: "Gets the state of 2021 Roblox Studio (Edit/Play mode)",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "screen_capture",
        description: "Captures a screenshot of the 2021 Roblox Studio / Aisaka window",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "execute_luau",
        description: "Executes Luau code in 2021 Roblox Studio edit context and returns output",
        inputSchema: {
          type: "object",
          properties: { code: { type: "string", description: "Luau code to run" } },
          required: ["code"],
        },
      },
      {
        name: "get_tree",
        description: "Scans and returns the hierarchy tree starting at root path",
        inputSchema: {
          type: "object",
          properties: {
            root: { type: "string", default: "game.Workspace" },
            maxDepth: { type: "number", default: 2 },
          },
        },
      },
      {
        name: "search_game_tree",
        description: "Explore the Roblox game hierarchy tree",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string", default: "Workspace" },
            max_depth: { type: "number", default: 2 },
          },
        },
      },
      {
        name: "read_script",
        description: "Reads the complete Source text of a Script",
        inputSchema: {
          type: "object",
          properties: { path: { type: "string" } },
          required: ["path"],
        },
      },
      {
        name: "script_read",
        description: "Reads a script from the Roblox workspace",
        inputSchema: {
          type: "object",
          properties: { target_file: { type: "string" } },
          required: ["target_file"],
        },
      },
      {
        name: "write_script",
        description: "Updates or overwrites the Source text of an existing Script in Studio",
        inputSchema: {
          type: "object",
          properties: { path: { type: "string" }, source: { type: "string" } },
          required: ["path", "source"],
        },
      },
      {
        name: "multi_edit",
        description: "Edits or creates scripts in Studio",
        inputSchema: {
          type: "object",
          properties: { file_path: { type: "string" }, edits: { type: "array" } },
          required: ["file_path", "edits"],
        },
      },
      {
        name: "create_instance",
        description: "Creates a new Instance in the DataModel",
        inputSchema: {
          type: "object",
          properties: {
            className: { type: "string" },
            name: { type: "string" },
            parent: { type: "string", default: "game.Workspace" },
            properties: { type: "object" },
          },
          required: ["className"],
        },
      },
      {
        name: "delete_instance",
        description: "Deletes an instance from the DataModel",
        inputSchema: {
          type: "object",
          properties: { path: { type: "string" } },
          required: ["path"],
        },
      },
      {
        name: "get_output_log",
        description: "Retrieves recent messages from Studio's output log",
        inputSchema: {
          type: "object",
          properties: { limit: { type: "number", default: 50 } },
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  if (name === "screen_capture") {
    try {
      const b64 = captureScreenBase64();
      return {
        content: [
          { type: "image", data: b64, mimeType: "image/png" },
          { type: "text", text: "Captured screenshot of Roblox Studio / Aisaka window." },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: "Screen capture failed: " + err.message }],
        isError: true,
      };
    }
  }

  try {
    const res = await handleToolDispatch(name, args || {});
    return {
      content: [
        {
          type: "text",
          text: typeof res === "string" ? res : JSON.stringify(res, null, 2),
        },
      ],
    };
  } catch (err) {
    return {
      content: [{ type: "text", text: "Error: " + err.message }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
