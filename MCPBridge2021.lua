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

-- 8. Global Script Grep / Search
local SAFE_SERVICES = {
    "Workspace",
    "ServerScriptService",
    "ReplicatedStorage",
    "StarterGui",
    "StarterPlayer",
    "Lighting",
    "ServerStorage",
    "ReplicatedFirst",
    "SoundService"
}

Handlers["script_grep"] = function(args)
    local query = args.pattern or args.query or ""
    if query == "" then
        error("Missing required parameter: 'pattern' or 'query'")
    end

    local caseSensitive = args.case_sensitive or false
    local isPlain = args.plain ~= false
    if not caseSensitive then
        query = string.lower(query)
    end

    local maxMatches = args.max_matches or 100
    local rootPath = args.root
    local roots = {}

    if rootPath and rootPath ~= "" then
        local r = resolvePath(rootPath)
        if r then
            table.insert(roots, r)
        else
            error("Root instance not found: " .. tostring(rootPath))
        end
    else
        for _, sName in ipairs(SAFE_SERVICES) do
            local ok, s = pcall(function() return game:GetService(sName) end)
            if ok and s then
                table.insert(roots, s)
            end
        end
    end

    local scriptsSearched = 0
    local matches = {}
    local totalMatches = 0

    local function scan(inst)
        if inst:IsA("LuaSourceContainer") then
            scriptsSearched = scriptsSearched + 1
            local src = ""
            pcall(function() src = inst.Source end)
            if src and #src > 0 then
                local lineNum = 1
                for line in string.gmatch(src .. "\n", "([^\r\n]*)[\r\n]") do
                    local searchIn = caseSensitive and line or string.lower(line)
                    local s, e = string.find(searchIn, query, 1, isPlain)
                    if s then
                        totalMatches = totalMatches + 1
                        if #matches < maxMatches then
                            table.insert(matches, {
                                script = inst:GetFullName(),
                                line = lineNum,
                                text = string.sub(line, 1, 300)
                            })
                        end
                    end
                    lineNum = lineNum + 1
                end
            end
        end

        local children = inst:GetChildren()
        for _, child in ipairs(children) do
            scan(child)
        end
    end

    for _, rootInst in ipairs(roots) do
        scan(rootInst)
    end

    return {
        query = query,
        scriptsSearched = scriptsSearched,
        totalMatches = totalMatches,
        matches = matches
    }
end

-- 9. Inspect Detailed Properties of an Instance
local INSPECT_PROPS = {
    Instance = { "Name", "ClassName", "Archivable" },
    PVInstance = { "Origin" },
    BasePart = {
        "Position", "Size", "CFrame", "Orientation", "BrickColor", "Color",
        "Material", "Transparency", "Reflectance", "Anchored", "CanCollide",
        "CanTouch", "CastShadow", "Massless", "CollisionGroupId"
    },
    Model = { "PrimaryPart", "LevelOfDetail" },
    LuaSourceContainer = { "Disabled" },
    Sound = { "SoundId", "Volume", "PlaybackSpeed", "Looped", "IsPlaying", "TimeLength", "RollOffMode" },
    Animation = { "AnimationId" },
    Decal = { "Texture", "Transparency", "Face", "Color3" },
    Texture = { "Texture", "Transparency", "Face", "Color3", "StudsPerTileU", "StudsPerTileV" },
    GuiObject = {
        "Position", "Size", "Visible", "ZIndex", "AnchorPoint",
        "BackgroundColor3", "BackgroundTransparency", "BorderColor3", "BorderSizePixel",
        "ClipsDescendants", "LayoutOrder"
    },
    TextLabel = { "Text", "TextColor3", "TextSize", "TextTransparency", "TextScaled", "Font", "TextXAlignment", "TextYAlignment" },
    TextButton = { "Text", "TextColor3", "TextSize", "TextTransparency", "TextScaled", "Font", "AutoButtonColor" },
    TextBox = { "Text", "TextColor3", "TextSize", "PlaceholderText", "ClearTextOnFocus", "MultiLine" },
    ImageLabel = { "Image", "ImageColor3", "ImageTransparency", "ScaleType" },
    ImageButton = { "Image", "ImageColor3", "ImageTransparency", "ScaleType" },
    ValueBase = { "Value" },
    Light = { "Brightness", "Color", "Enabled", "Shadows" },
    PointLight = { "Range" },
    SpotLight = { "Angle", "Range", "Face" },
    SurfaceLight = { "Angle", "Range", "Face" },
    Humanoid = { "Health", "MaxHealth", "WalkSpeed", "JumpPower", "RigType", "DisplayName", "HipHeight" },
    ParticleEmitter = { "Texture", "Rate", "Speed", "Lifetime", "Enabled", "LightEmission", "Size" },
    Beam = { "Texture", "Color", "LightEmission", "Transparency", "Width0", "Width1", "FaceCamera", "Enabled" },
    Trail = { "Texture", "Color", "Lifetime", "Transparency", "WidthScale", "FaceCamera", "Enabled" },
    SpecialMesh = { "MeshId", "TextureId", "MeshType", "Scale", "Offset" },
    MeshPart = { "MeshId", "TextureID", "Size" }
}

Handlers["inspect_instance"] = function(args)
    local inst = resolvePath(args.path)
    if not inst then
        error("Instance not found: " .. tostring(args.path))
    end

    local result = {
        name = inst.Name,
        className = inst.ClassName,
        path = inst:GetFullName(),
        parent = inst.Parent and inst.Parent:GetFullName() or "nil",
        childCount = #inst:GetChildren(),
        properties = {},
        children = {},
        attributes = {},
        tags = {}
    }

    for _, child in ipairs(inst:GetChildren()) do
        table.insert(result.children, {
            name = child.Name,
            className = child.ClassName
        })
    end

    local checkedProps = {}
    for clsName, props in pairs(INSPECT_PROPS) do
        local isMatch = false
        pcall(function() isMatch = inst:IsA(clsName) end)
        if isMatch then
            for _, prop in ipairs(props) do
                if not checkedProps[prop] then
                    checkedProps[prop] = true
                    pcall(function()
                        local val = inst[prop]
                        if typeof then
                            local t = typeof(val)
                            if t == "Vector3" then
                                result.properties[prop] = string.format("(%.2f, %.2f, %.2f)", val.X, val.Y, val.Z)
                            elseif t == "CFrame" then
                                result.properties[prop] = tostring(val)
                            elseif t == "Color3" then
                                result.properties[prop] = string.format("RGB(%d, %d, %d)", math.floor(val.R*255), math.floor(val.G*255), math.floor(val.B*255))
                            elseif t == "Instance" then
                                result.properties[prop] = val:GetFullName()
                            else
                                result.properties[prop] = tostring(val)
                            end
                        else
                            result.properties[prop] = tostring(val)
                        end
                    end)
                end
            end
        end
    end

    if inst:IsA("LuaSourceContainer") then
        pcall(function()
            result.properties["SourceLength"] = #inst.Source
        end)
    end

    pcall(function()
        if inst.GetAttributes then
            result.attributes = inst:GetAttributes()
        end
    end)

    pcall(function()
        local cs = game:GetService("CollectionService")
        result.tags = cs:GetTags(inst)
    end)

    return result
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
