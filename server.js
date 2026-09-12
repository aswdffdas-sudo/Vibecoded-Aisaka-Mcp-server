import express from "express";
import cors from "cors";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { v4 as uuidv4 } from "uuid";

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
  return res.status(204).end(); // No pending tasks
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

// Setup Model Context Protocol (MCP) Server
const server = new Server(
  {
    name: "roblox-2021-studio",
    version: "1.0.0",
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
