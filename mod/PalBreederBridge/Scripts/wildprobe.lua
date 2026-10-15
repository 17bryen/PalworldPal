-- Wild pal probe, round 2: follows the in-world pal characters instead of their data objects.
-- Only runs while the file %APPDATA%\palbreeder\bridge\wild-probe.on exists.
--
-- Round 1 showed the data objects (PalIndividualCharacterParameter) outlive the characters and
-- mostly aren't attached to them, so they can't give positions or despawns. This round hooks the
-- characters (PalMonsterCharacter) as the game creates them, reads where each one is every couple
-- of seconds, and tries several ways to get from a character to its data (species, passives, owner).
-- Files:
--   wild-probe.json            the latest read (not overwritten by an empty read after leaving)
--   wild-probe-peak.json       the read with the most characters loaded
--   wild-probe-structure.json  a one-off look at the classes involved, written once per game
--   wild-probe-log.txt         one line per read

local M = {}

local READ_EVERY = 2.0
local FLAG_EVERY = 3.0
local NO_ID = "00000000000000000000000000000000"
local CHARACTER = "/Script/Pal.PalMonsterCharacter"
local HOOKS = { "/Script/Pal.PalIndividualCharacterParameter", "/Script/Pal.PalCharacter", CHARACTER }

local ctx, get, alive = nil, nil, nil
local enabled = false
local flagCheckedAt = -1000.0
local lastRead = -1000.0
local startedAt = nil
local seeded = false
local structureWritten = false
local peak = 0
local session = string.format("%x", os.time())

local pending = {}      -- characters created since the last read
local tracked = {}      -- address -> { actor, link, param, since }
local hookCounts, hookStatus = {}, {}
local stats = { despawned = 0, linked = 0 }
local linkWins = {}     -- which way of finding a character's data worked, and how often

local function guid(g)
    if g == nil then return nil end
    local ok, s = pcall(function()
        return string.format("%08x%08x%08x%08x", math.tointeger(g.A) & 0xffffffff, math.tointeger(g.B) & 0xffffffff,
            math.tointeger(g.C) & 0xffffffff, math.tointeger(g.D) & 0xffffffff)
    end)
    if ok then return s end
    return nil
end
local function address(o) return get(function(x) return x:GetAddress() end, o) end
local function fname(o) return get(function(x) return x:GetFName():ToString() end, o) end
local function className(o) return fname(get(function(x) return x:GetClass() end, o)) end
local function fullName(o) return get(function(x) return x:GetFullName() end, o) end

local ESCAPES = { ['"'] = '\\"', ['\\'] = '\\\\' }
local function encode(v)
    local t = type(v)
    if t == "nil" then return "null" end
    if t == "boolean" then return v and "true" or "false" end
    if t == "number" then
        if v ~= v or v == math.huge or v == -math.huge then return "null" end
        if math.type(v) == "integer" then return tostring(v) end
        return string.format("%.1f", v)
    end
    if t == "string" then
        return '"' .. (v:gsub('[%c"\\]', function(ch) return ESCAPES[ch] or string.format('\\u%04x', ch:byte()) end)) .. '"'
    end
    if t == "table" then
        local parts = {}
        if v[1] ~= nil or next(v) == nil then
            for i = 1, #v do parts[i] = encode(v[i]) end
            return "[" .. table.concat(parts, ",") .. "]"
        end
        local keys = {}
        for k in pairs(v) do keys[#keys + 1] = tostring(k) end
        table.sort(keys)
        for i, k in ipairs(keys) do parts[i] = encode(k) .. ":" .. encode(v[k]) end
        return "{" .. table.concat(parts, ",") .. "}"
    end
    return encode(tostring(v))
end

local function appendLog(line)
    if ctx.outDir == nil then return end
    local f = io.open(ctx.outDir .. "wild-probe-log.txt", "a")
    if f == nil then return end
    f:write(os.date("%H:%M:%S") .. "  " .. line .. "\n")
    f:close()
end

function M.setup(c)
    ctx, get, alive = c, c.get, c.alive
    for _, path in ipairs(HOOKS) do
        hookCounts[path] = 0
        local ok, err = pcall(NotifyOnNewObject, path, function(obj)
            -- Runs as the game creates the object: count it and queue it, nothing more
            if not enabled then return end
            hookCounts[path] = hookCounts[path] + 1
            if path == CHARACTER then pending[#pending + 1] = obj end
        end)
        hookStatus[path] = ok and "registered" or tostring(err)
    end
end

-- ---- From a character to its data ----

local function isParam(p)
    return p ~= nil and alive(p) and get(function(x) return x.SaveParameter.CharacterID:ToString() end, p) ~= nil
end
local function component(a) return a.CharacterParameterComponent end
-- Tried in turn; the first that gives a pal data object wins and is counted in linkWins
local LINKS = {
    { "component:GetIndividualParameter()", function(a) return component(a):GetIndividualParameter() end },
    { "component.IndividualParameter", function(a) return component(a).IndividualParameter end },
    { "component.IndividualHandle:TryGetIndividualParameter()", function(a) return component(a).IndividualHandle:TryGetIndividualParameter() end },
    { "component.IndividualHandle.IndividualParameter", function(a) return component(a).IndividualHandle.IndividualParameter end },
    { "actor:GetIndividualParameter()", function(a) return a:GetIndividualParameter() end },
}
local function link(actor)
    for _, l in ipairs(LINKS) do
        local p = get(l[2], actor)
        if isParam(p) then return l[1], p end
    end
    return nil, nil
end

local function readSpecies(sp) return sp.CharacterID:ToString() end
local function readPassives(sp)
    local names = {}
    sp.PassiveSkillList:ForEach(function(_, e) names[#names + 1] = e:get():ToString() end)
    return names
end
local function readPal(param, out)
    local sp = get(function(p) return p.SaveParameter end, param)
    if sp == nil then return end
    out.species = get(readSpecies, sp)
    out.level = get(function(s) return s.Level end, sp)
    out.gender = get(function(s) return s.Gender end, sp)
    out.passives = get(readPassives, sp)
    local owner = guid(get(function(s) return s.OwnerPlayerUId end, sp))
    local container = guid(get(function(s) return s.SlotID.ContainerId.ID end, sp))
    out.wild = (owner == nil or owner == NO_ID) and (container == nil or container == NO_ID)
    out.alpha = out.species ~= nil and out.species:sub(1, 5):upper() == "BOSS_"
    if out.passives then for _, p in ipairs(out.passives) do if p == "Rare" then out.lucky = true end end end
    out.rare = get(function(p) return p:IsRarePal() end, param)
end

-- ---- One-off structure dump ----

local function describe(obj, maxDepth)
    local out = {}
    local cls = get(function(o) return o:GetClass() end, obj)
    for _ = 1, maxDepth do
        if cls == nil or not alive(cls) then break end
        local props = {}
        pcall(function()
            cls:ForEachProperty(function(p)
                local name = fname(p) or "?"
                local kind = get(function(q) return q:GetClass():GetFName():ToString() end, p) or "?"
                local entry = name .. ":" .. kind
                if kind == "ArrayProperty" or kind == "MapProperty" or kind == "SetProperty" then
                    local v = get(function(o) return o[name] end, obj)
                    local n = v and get(function(a) return a:GetArrayNum() end, v)
                    if n then entry = entry .. " (" .. tostring(n) .. ")" end
                elseif kind == "ObjectProperty" then
                    local v = get(function(o) return o[name] end, obj)
                    local c = v and alive(v) and className(v)
                    if c then entry = entry .. " = " .. c end
                end
                props[#props + 1] = entry
            end)
        end)
        local name = fname(cls) or "?"
        out[#out + 1] = { class = name, props = props }
        if name == "Actor" or name == "Object" or name == "ActorComponent" then break end
        cls = get(function(c) return c:GetSuperStruct() end, cls)
    end
    return out
end

local function writeStructure(entry)
    structureWritten = true
    local s = { actorFullName = fullName(entry.actor), actor = describe(entry.actor, 8) }
    local comp = get(component, entry.actor)
    if comp and alive(comp) then s.component = describe(comp, 4) end
    local handle = comp and get(function(c) return c.IndividualHandle end, comp)
    if handle and alive(handle) then s.handle = describe(handle, 3) end
    if entry.param then
        s.param = describe(entry.param, 3)
        s.paramOuter = fullName(get(function(p) return p:GetOuter() end, entry.param))
    end
    for _, name in ipairs({ "PalCharacterManager", "PalNPCManager" }) do
        local o = get(FindFirstOf, name)
        s[name] = (o and alive(o)) and describe(o, 3) or "not found"
    end
    ctx.writeFile("wild-probe-structure.json", encode(s))
end

-- ---- Ticking ----

local function playerLocation(pc)
    local pawn = pc and get(function(p) return p.Pawn end, pc)
    if pawn == nil or not alive(pawn) then return nil end
    return get(function(p) return p:K2_GetActorLocation() end, pawn)
end

local function track(actor, now)
    if not alive(actor) then return end
    local key = address(actor)
    if key == nil or tracked[key] then return end
    tracked[key] = { actor = actor, since = now }
end

local function read(pc, now)
    lastRead = now
    local started = os.clock()
    for _, a in ipairs(pending) do track(a, now) end
    pending = {}

    local me = playerLocation(pc)
    local rows, nearest, farthest, hidden, wild = {}, nil, nil, 0, 0
    for key, e in pairs(tracked) do
        local a = e.actor
        if not alive(a) then
            tracked[key] = nil
            stats.despawned = stats.despawned + 1
        else
            if e.param == nil and (now - e.since) < 20 then
                -- The data can arrive after the character; keep trying for a while
                local how, p = link(a)
                if how then
                    e.link, e.param = how, p
                    linkWins[how] = (linkWins[how] or 0) + 1
                    stats.linked = stats.linked + 1
                end
            end
            local loc = get(function(x) return x:K2_GetActorLocation() end, a)
            local row = { class = className(a), link = e.link }
            if loc then
                row.x, row.y, row.z = loc.X, loc.Y, loc.Z
                if me then
                    local d = math.sqrt((loc.X - me.X) ^ 2 + (loc.Y - me.Y) ^ 2 + (loc.Z - me.Z) ^ 2) / 100 -- metres
                    row.m = d
                    if nearest == nil or d < nearest then nearest = d end
                    if farthest == nil or d > farthest then farthest = d end
                end
            end
            row.hidden = get(function(x) return x.bHidden end, a)
            if row.hidden then hidden = hidden + 1 end
            if e.param and alive(e.param) then readPal(e.param, row) end
            if row.wild then wild = wild + 1 end
            rows[#rows + 1] = row
            if not structureWritten and e.param and (now - e.since) > 1 then writeStructure(e) end
        end
    end
    -- Nothing ever linked: still dump the classes once, so the next round knows where to look
    if not structureWritten and #rows > 0 and (now - startedAt) > 60 then
        for _, e in pairs(tracked) do writeStructure(e); break end
    end
    table.sort(rows, function(a, b) return (a.m or 1e9) < (b.m or 1e9) end)
    local readMs = (os.clock() - started) * 1000

    appendLog(string.format("%d characters loaded (%d wild, %d hidden), nearest %s m, farthest %s m, %d despawned so far, read in %.1f ms; data found by %s; hooks %s",
        #rows, wild, hidden, nearest and string.format("%.0f", nearest) or "-", farthest and string.format("%.0f", farthest) or "-",
        stats.despawned, readMs, encode(linkWins), encode(hookCounts)))
    if #rows == 0 then return end
    local text = encode({
        session = session, at = os.date("%H:%M:%S"), readMs = readMs, loaded = #rows, wild = wild, hidden = hidden,
        nearest = nearest, farthest = farthest, player = me and { x = me.X, y = me.Y, z = me.Z }, stats = stats,
        linkWins = linkWins, hooks = hookCounts, hookStatus = hookStatus, characters = rows,
    })
    ctx.writeFile("wild-probe.json", text)
    if #rows > peak then
        peak = #rows
        ctx.writeFile("wild-probe-peak.json", text)
    end
end

-- A new world or character: start over, scanning again for the characters already around
function M.reset()
    pending, tracked = {}, {}
    seeded = false
    if enabled then appendLog("new world or character, starting over") end
end

-- Called on the game thread from the bridge's job
function M.tick(pc, now)
    if ctx == nil or ctx.outDir == nil then return end
    if (now - flagCheckedAt) >= FLAG_EVERY then
        flagCheckedAt = now
        local f = io.open(ctx.outDir .. "wild-probe.on", "r")
        enabled = f ~= nil
        if f then f:close() end
    end
    if not enabled then return end
    if not seeded then
        seeded = true
        startedAt = startedAt or now
        local started = os.clock()
        local found = get(FindAllOf, "PalMonsterCharacter")
        local ms = (os.clock() - started) * 1000
        if type(found) == "table" then for i = 1, #found do pending[#pending + 1] = found[i] end end
        appendLog(string.format("probe v2 started; hooks %s; first scan found %d characters in %.1f ms",
            encode(hookStatus), type(found) == "table" and #found or 0, ms))
        return
    end
    if (now - lastRead) >= READ_EVERY then
        local ok, err = pcall(read, pc, now)
        if not ok then appendLog("read failed: " .. tostring(err)) end
    end
end

return M
