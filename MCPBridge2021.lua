-- 2021 Roblox Studio MCP Plugin Bridge
-- Compatible with Lua 5.1 / Luau (2021 Studio builds)
-- Place this script in your Studio Plugins folder or run as a local plugin.

local HttpService = game:GetService("HttpService")
local ChangeHistoryService = game:GetService("ChangeHistoryService")
local ServerScriptService = game:GetService("ServerScriptService")
local LogService = game:GetService("LogService")

local BRIDGE_URL = "http://127.0.0.1:3021"
local sleep = (task and task.wait) or wait
local spawnThread = (task and task.spawn) or spawn

-- Enable loadstring if not already enabled
pcall(function()
    ServerScriptService.LoadStringEnabled = true
end)

-- Safe path resolution supporting service names and nested instances
local function resolvePath(pathStr)
    if not pathStr or pathStr == "" or pathStr == "game" then
        return game
    end
    
    -- Handle common roots
    if pathStr:sub(1, 5) == "game." then
        pathStr = pathStr:sub(6)
    elseif pathStr:sub(1, 10) == "Workspace." then
        pathStr = pathStr:sub(11)
        return resolvePath("Workspace"):FindFirstChild(pathStr)
    end

    local parts = {}
    for part in string.gmatch(pathStr, "[^%.]+") do
        table.insert(parts, part)
    end

    local current = game
    for i, part in ipairs(parts) do
        if i == 1 then
            local ok, service = pcall(function()
                return game:GetService(part)
            end)
            if ok and service then
                current = service
            else
                current = current:FindFirstChild(part)
            end
        else
            current = current:FindFirstChild(part)
        end

        if not current then
            return nil
        end
    end

    return current
end

-- Handlers for MCP tool requests
local Handlers = {}

-- 1. Execute Luau
Handlers["execute_luau"] = function(args)
    local code = args.code
    if not code or code == "" then
        error("Missing required parameter: code")
    end

    local fn, compileErr = loadstring(code)
    if not fn then
        error("Compilation error: " .. tostring(compileErr))
    end

    ChangeHistoryService:SetWaypoint("MCP_ExecuteBefore")
    local results = table.pack(pcall(fn))
    ChangeHistoryService:SetWaypoint("MCP_ExecuteAfter")

    local ok = results[1]
    if not ok then
        error(tostring(results[2]))
    end

    if results.n > 1 then
        local outputs = {}
        for i = 2, results.n do
            table.insert(outputs, tostring(results[i]))
        end
        return table.concat(outputs, "\t")
    end

    return "Executed successfully"
end

-- 2. Read Script Source
Handlers["read_script"] = function(args)
    local inst = resolvePath(args.path)
    if not inst then
        error("Instance not found: " .. tostring(args.path))
    end
    if not inst:IsA("LuaSourceContainer") then
        error("Target is not a script (ClassName: " .. tostring(inst.ClassName) .. ")")
    end
    return inst.Source
end

-- 3. Write Script Source
Handlers["write_script"] = function(args)
    local inst = resolvePath(args.path)
    if not inst then
        error("Instance not found: " .. tostring(args.path))
    end
    if not inst:IsA("LuaSourceContainer") then
        error("Target is not a script (ClassName: " .. tostring(inst.ClassName) .. ")")
    end

    ChangeHistoryService:SetWaypoint("MCP_WriteScript_" .. inst.Name)
    inst.Source = args.source or ""
    ChangeHistoryService:SetWaypoint("MCP_WriteScriptEnd")
    return "Successfully updated script: " .. inst:GetFullName()
end

-- 4. Get Hierarchy Tree
Handlers["get_tree"] = function(args)
    local rootPath = args.root or "game.Workspace"
    local root = resolvePath(rootPath)
    if not root then
        error("Root instance not found: " .. tostring(rootPath))
    end

    local maxDepth = args.maxDepth or 2
    local maxChildren = args.maxChildren or 50

    local function scan(inst, currentDepth)
        if currentDepth > maxDepth then
            return nil
        end

        local children = inst:GetChildren()
        local nodes = {}
        local count = 0

        for _, child in ipairs(children) do
            count = count + 1
            if count > maxChildren then
                table.insert(nodes, {
                    Name = string.format("... (%d more children)", #children - maxChildren),
                    ClassName = "Truncated"
                })
                break
            end

            table.insert(nodes, {
                Name = child.Name,
                ClassName = child.ClassName,
                ChildCount = #child:GetChildren(),
                Children = scan(child, currentDepth + 1)
            })
        end

        return nodes
    end

    return {
        Name = root.Name,
        ClassName = root.ClassName,
        ChildCount = #root:GetChildren(),
        Children = scan(root, 1)
    }
end

-- 5. Create Instance
Handlers["create_instance"] = function(args)
    local className = args.className
    local parentPath = args.parent or "game.Workspace"
    local parent = resolvePath(parentPath)
    if not parent then
        error("Parent not found: " .. tostring(parentPath))
    end

    ChangeHistoryService:SetWaypoint("MCP_CreateInstance_" .. tostring(className))
    local inst = Instance.new(className)
    if args.name then
        inst.Name = args.name
    end

    if args.properties and type(args.properties) == "table" then
        for propName, propValue in pairs(args.properties) do
            pcall(function()
                inst[propName] = propValue
            end)
        end
    end

    inst.Parent = parent
    ChangeHistoryService:SetWaypoint("MCP_CreateInstanceEnd")

    return {
        success = true,
        name = inst.Name,
        className = inst.ClassName,
        path = inst:GetFullName()
    }
end

-- 6. Delete Instance
Handlers["delete_instance"] = function(args)
    local inst = resolvePath(args.path)
    if not inst then
        error("Instance not found: " .. tostring(args.path))
    end

    ChangeHistoryService:SetWaypoint("MCP_DeleteInstance_" .. inst.Name)
    local name = inst:GetFullName()
    inst:Destroy()
    ChangeHistoryService:SetWaypoint("MCP_DeleteInstanceEnd")

    return "Destroyed: " .. name
end

-- 7. Get Output Logs
Handlers["get_output_log"] = function(args)
    local limit = args.limit or 50
    local logs = LogService:GetLogHistory()
    local output = {}
    local startIdx = math.max(1, #logs - limit + 1)

    for i = startIdx, #logs do
        local entry = logs[i]
        table.insert(output, string.format("[%s] %s", tostring(entry.messageType.Name), tostring(entry.message)))
    end

    return table.concat(output, "\n")
end

-- Plugin UI & Toolbar Setup
local isRunning = true
local toolbar = plugin:CreateToolbar("MCP 2021 Bridge")
local toggleButton = toolbar:CreateButton(
    "MCP Bridge",
    "Toggle MCP polling for 2021 Roblox Studio",
    ""
)

toggleButton.Click:Connect(function()
    isRunning = not isRunning
    if isRunning then
        print("[MCP 2021] Polling resumed.")
    else
        print("[MCP 2021] Polling paused.")
    end
end)

-- Main Polling Loop
spawnThread(function()
    print("[MCP 2021] Bridge initialized. Connecting to " .. BRIDGE_URL .. " ...")
    local consecutiveFailures = 0

    while true do
        if isRunning then
            local requestSuccess, response = pcall(function()
                return HttpService:RequestAsync({
                    Url = BRIDGE_URL .. "/poll",
                    Method = "GET",
                    Headers = {
                        ["Content-Type"] = "application/json"
                    }
                })
            end)

            if requestSuccess and response then
                consecutiveFailures = 0

                -- 200 OK means there is a task pending
                if response.StatusCode == 200 and response.Body and #response.Body > 0 then
                    local decodeSuccess, data = pcall(function()
                        return HttpService:JSONDecode(response.Body)
                    end)

                    if decodeSuccess and data and data.tool then
                        local handler = Handlers[data.tool]
                        local toolSuccess, toolResult

                        if handler then
                            toolSuccess, toolResult = pcall(handler, data.args or {})
                        else
                            toolSuccess = false
                            toolResult = "No handler registered for tool: " .. tostring(data.tool)
                        end

                        -- Return response back to the local MCP server
                        pcall(function()
                            HttpService:RequestAsync({
                                Url = BRIDGE_URL .. "/respond",
                                Method = "POST",
                                Headers = {
                                    ["Content-Type"] = "application/json"
                                },
                                Body = HttpService:JSONEncode({
                                    id = data.id,
                                    success = toolSuccess,
                                    result = toolSuccess and toolResult or nil,
                                    error = (not toolSuccess) and tostring(toolResult) or nil
                                })
                            })
                        end)
                    end
                end
            else
                consecutiveFailures = consecutiveFailures + 1
            end
        end

        -- Poll interval: fast (0.15s) when running, back off to 1s if server offline
        if consecutiveFailures > 2 then
            sleep(1.0)
        else
            sleep(0.15)
        end
    end
end)
