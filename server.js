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

app.listen(PORT, "127.0.0.1", () => {
  console.error(`[Roblox 2021 MCP] HTTP bridge listening on http://127.0.0.1:${PORT}`);
});

function sendToStudio(tool, args, timeoutMs = 25000) {
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
    [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hDC, uint nFlags);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
"@

$targetHwnd = [IntPtr]::Zero

# Detect running Studio / Aisaka window
$procs = Get-Process | Where-Object { 
    $_.MainWindowTitle -like "*Roblox Studio*" -or 
    $_.MainWindowTitle -like "*Aisaka*" -or 
    $_.ProcessName -like "*RobloxStudio*" -or
    $_.ProcessName -like "*Aisaka*"
}

if ($procs) {
    $targetHwnd = $procs[0].MainWindowHandle
    if ([WinUser]::IsIconic($targetHwnd)) {
        [WinUser]::ShowWindow($targetHwnd, 9) | Out-Null
        Start-Sleep -Milliseconds 150
    }
}

if ($targetHwnd -ne [IntPtr]::Zero) {
    $rect = New-Object WinUser+RECT
    [WinUser]::GetWindowRect($targetHwnd, [ref]$rect) | Out-Null
    $w = [Math]::Max(10, $rect.Right - $rect.Left)
    $h = [Math]::Max(10, $rect.Bottom - $rect.Top)
    
    $bmp = New-Object System.Drawing.Bitmap($w, $h)
    $gfx = [System.Drawing.Graphics]::FromImage($bmp)
    $hdc = $gfx.GetHdc()
    $printOk = [WinUser]::PrintWindow($targetHwnd, $hdc, 2)
    $gfx.ReleaseHdc($hdc)
    $gfx.Dispose()

    # Fallback to screen area copy if PrintWindow returns blank
    if (-not $printOk) {
        $bmp.Dispose()
        $bmp = New-Object System.Drawing.Bitmap($w, $h)
        $gfx = [System.Drawing.Graphics]::FromImage($bmp)
        $gfx.CopyFromScreen($rect.Left, $rect.Top, 0, 0, (New-Object System.Drawing.Size($w, $h)))
        $gfx.Dispose()
    }
} else {
    # Fullscreen fallback
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

// Setup Model Context Protocol (MCP) Server
const server = new Server(
  {
    name: "roblox-2021-studio",
    version: "1.1.0",
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
        name: "screen_capture",
        description: "Captures a screenshot of the 2021 Roblox Studio / Aisaka window or active screen and returns it as an image for visual inspection",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "execute_luau",
        description: "Executes Luau code in 2021 Roblox Studio edit context and returns output",
        inputSchema: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description: "Luau code to run in Studio",
            },
          },
          required: ["code"],
        },
      },
      {
        name: "get_tree",
        description: "Scans and returns the hierarchy tree starting at root path",
        inputSchema: {
          type: "object",
          properties: {
            root: {
              type: "string",
              description: "Instance path (e.g. 'game.Workspace', 'game.ServerScriptService')",
              default: "game.Workspace",
            },
            maxDepth: {
              type: "number",
              description: "Max recursive depth to traverse (default: 2)",
              default: 2,
            },
          },
        },
      },
      {
        name: "read_script",
        description: "Reads the complete Source text of a Script, LocalScript, or ModuleScript",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Full instance path (e.g. 'game.ServerScriptService.MyScript')",
            },
          },
          required: ["path"],
        },
      },
      {
        name: "write_script",
        description: "Updates or overwrites the Source text of an existing Script in Studio",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Full instance path",
            },
            source: {
              type: "string",
              description: "New source code for the script",
            },
          },
          required: ["path", "source"],
        },
      },
      {
        name: "create_instance",
        description: "Creates a new Instance in the DataModel",
        inputSchema: {
          type: "object",
          properties: {
            className: {
              type: "string",
              description: "Class name of the instance (e.g. 'Part', 'Folder', 'Script')",
            },
            name: {
              type: "string",
              description: "Name for the new instance",
            },
            parent: {
              type: "string",
              description: "Parent path (e.g. 'game.Workspace')",
              default: "game.Workspace",
            },
            properties: {
              type: "object",
              description: "Key-value dictionary of initial properties",
            },
          },
          required: ["className"],
        },
      },
      {
        name: "delete_instance",
        description: "Deletes an instance from the DataModel",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Path of instance to destroy",
            },
          },
          required: ["path"],
        },
      },
      {
        name: "get_output_log",
        description: "Retrieves recent messages from Studio's output log",
        inputSchema: {
          type: "object",
          properties: {
            limit: {
              type: "number",
              description: "Maximum lines to retrieve (default: 50)",
              default: 50,
            },
          },
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
          {
            type: "image",
            data: b64,
            mimeType: "image/png",
          },
          {
            type: "text",
            text: "Captured screenshot of Roblox Studio / Aisaka window.",
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: "Screen capture failed: " + err.message,
          },
        ],
        isError: true,
      };
    }
  }

  try {
    const res = await sendToStudio(name, args || {});
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
      content: [
        {
          type: "text",
          text: "Error: " + err.message,
        },
      ],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
