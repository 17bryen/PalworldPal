-- Diagnostic probe: finds out which of the player's pals (party, Palbox, Dimensional Pal Storage)
-- this client can see, and where the game keeps them. It only runs while the file
-- %APPDATA%\palbreeder\bridge\probe.on exists, and only reads.
--
-- Every few seconds it lists the pal records the client holds, grouped by the container (party,
-- box, storage...) each one sits in. It writes:
--   probe.json      the latest snapshot, plus a one-off map of the game classes involved
--   probe-log.txt   one line each time the grouping changes, so opening a menu shows up as a step

local M = {}

local PROBE_EVERY = 5.0  -- seconds between snapshots
local FLAG_EVERY = 5.0   -- seconds between checks for probe.on

local ctx = nil
local get, alive = nil, nil

function M.setup(c)
    ctx = c
    get, alive = c.get, c.alive
end

-- JSON ----------------------------------------------------------------------------------------

local ESCAPES = { ['"'] = '\\"', ['\\'] = '\\\\', ['\n'] = '\\n', ['\r'] = '\\r', ['\t'] = '\\t' }
local function encode(v)
    local t = type(v)
    if t == "nil" then return "null" end
    if t == "boolean" then return v and "true" or "false" end
    if t == "number" then
        if v ~= v or v == math.huge or v == -math.huge then return "null" end
        if math.type(v) == "integer" then return tostring(v) end
        return string.format("%.6g", v)
    end
    if t == "string" then
        return '"' .. (v:gsub('[%c"\\]', function(ch) return ESCAPES[ch] or string.format("\\u%04x", ch:byte()) end)) .. '"'
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

-- Reflection helpers --------------------------------------------------------------------------

local function fullName(o) return get(function(x) return x:GetFullName() end, o) end
local function fname(o) return get(function(x) return x:GetFName():ToString() end, o) end
local function str(v) return get(function(x) return x:ToString() end, v) end

local function guid(g)
    if g == nil then return nil end
    local ok, s = pcall(function()
        local a, b, c, d = math.tointeger(g.A), math.tointeger(g.B), math.tointeger(g.C), math.tointeger(g.D)
        return string.format("%08x%08x%08x%08x", a & 0xffffffff, b & 0xffffffff, c & 0xffffffff, d & 0xffffffff)
    end)
    if ok then return s end
    return nil
end

local function field(obj, ...)
    for i = 1, select("#", ...) do
        local name = select(i, ...)
        local v = get(function(o) return o[name] end, obj)
        if v ~= nil then return v, name end
    end
    return nil, nil
end

-- "Name:PropertyType" for a struct's own properties, recursing into structs a couple of levels
local function structProps(struct, depth)
    local out = {}
    pcall(function()
        struct:ForEachProperty(function(p)
            local name = fname(p) or "?"
            local kind = get(function(q) return q:GetClass():GetFName():ToString() end, p) or "?"
            local entry = name .. ":" .. kind
            if kind == "StructProperty" and depth > 0 then
                local inner = get(function(q) return q:GetStruct() end, p)
                if inner ~= nil then
                    entry = { name = entry, struct = fname(inner), props = structProps(inner, depth - 1) }
                end
            end
            out[#out + 1] = entry
        end)
    end)
    return out
end

-- An object's class chain (Pal* classes plus the first engine class) with properties and functions
local function classMap(obj)
    local out = {}
    local cls = get(function(o) return o:GetClass() end, obj)
    for _ = 1, 5 do
        if cls == nil then break end
        local cname = fname(cls) or "?"
        local funcs = {}
        pcall(function() cls:ForEachFunction(function(f) funcs[#funcs + 1] = fname(f) end) end)
        out[#out + 1] = { class = cname, props = structProps(cls, 2), funcs = funcs }
        if cname:sub(1, 3) ~= "Pal" then break end
        cls = get(function(c) return c:GetSuperStruct() end, cls)
    end
    return out
end

-- The values of an object's object-typed properties, as full names
local function objectRefs(obj)
    local out = {}
    local cls = get(function(o) return o:GetClass() end, obj)
    for _ = 1, 5 do
        if cls == nil then break end
        local cname = fname(cls) or "?"
        pcall(function()
            cls:ForEachProperty(function(p)
                local kind = get(function(q) return q:GetClass():GetFName():ToString() end, p)
                if kind == "ObjectProperty" then
                    local name = fname(p)
                    local v = name and get(function(o) return o[name] end, obj)
                    out[name or "?"] = (v ~= nil and alive(v)) and fullName(v) or false
                end
            end)
        end)
        if cname:sub(1, 3) ~= "Pal" then break end
        cls = get(function(c) return c:GetSuperStruct() end, cls)
    end
    return out
end

local INTERESTING = { "Otomo", "Storage", "Container", "Box", "Dimension", "Party", "Slot", "Character" }
local function interesting(name)
    if type(name) ~= "string" then return false end
    for _, w in ipairs(INTERESTING) do
        if name:find(w, 1, true) then return true end
    end
    return false
end

-- Snapshot ------------------------------------------------------------------------------------

local function readPal(param)
    local p = { object = fullName(param) }
    local sp = field(param, "SaveParameter")
    if sp == nil then
        p.error = "no SaveParameter"
        return p
    end
    p.species = str(field(sp, "CharacterID"))
    p.gender = field(sp, "Gender")
    p.level = field(sp, "Level")
    p.nick = str(field(sp, "NickName"))
    p.isPlayer = field(sp, "IsPlayer")
    p.owner = guid(field(sp, "OwnerPlayerUId"))
    local slot, slotField = field(sp, "SlotID", "SlotId")
    if slot ~= nil then
        p.slotField = slotField
        p.container = guid(get(function(s) return s.ContainerId.ID end, slot))
        p.slot = get(function(s) return s.SlotIndex end, slot)
    end
    local list = field(sp, "PassiveSkillList")
    if list ~= nil then
        local names = {}
        pcall(function() list:ForEach(function(_, e) names[#names + 1] = str(e:get()) or "?" end) end)
        p.passives = names
    end
    p.talent = { hp = field(sp, "Talent_HP"), shot = field(sp, "Talent_Shot"), defense = field(sp, "Talent_Defense") }
    return p
end

local function findAll(className)
    local found = get(FindAllOf, className)
    local out = {}
    if type(found) ~= "table" then return out end
    for i = 1, #found do
        local o = found[i]
        if alive(o) then
            local n = fullName(o)
            if n == nil or not n:find("Default__", 1, true) then out[#out + 1] = o end
        end
    end
    return out
end

-- Class names worth counting. Guesses beyond the first are cheap to check and show in the output.
local COUNT_CLASSES = {
    "PalIndividualCharacterParameter", "PalIndividualCharacterContainer", "PalIndividualCharacterSlot",
    "PalIndividualCharacterHandle", "PalPlayerDataPalStorage", "PalPlayerOtomoData", "PalOtomoHolderComponentBase",
    "PalCharacterContainerManager", "PalDimensionPalStorage", "PalBaseCampWorkerDirector",
}

local structure = nil
local function describeStructure(pc, ps, pals)
    local s = { player = {}, pawn = {}, classes = {} }
    if ps ~= nil then
        s.playerStateClass = classMap(ps)
        s.player = objectRefs(ps)
        for name, ref in pairs(s.player) do
            if ref and interesting(name) then
                local o = get(function(x) return x[name] end, ps)
                if alive(o) then s.classes["PlayerState." .. name] = classMap(o) end
            end
        end
        s.playerUId = guid(field(ps, "PlayerUId"))
    end
    local pawn = get(function(x) return x.Pawn end, pc)
    if alive(pawn) then
        for name, ref in pairs(objectRefs(pawn)) do
            if interesting(name) or interesting(ref) then s.pawn[name] = ref end
        end
        for name, ref in pairs(s.pawn) do
            if ref and (name:find("Otomo", 1, true) or name:find("Container", 1, true)) then
                local o = get(function(x) return x[name] end, pawn)
                if alive(o) then s.classes["Pawn." .. name] = classMap(o) end
            end
        end
    end
    if pals[1] ~= nil then s.classes.IndividualParameter = classMap(pals[1]) end
    return s
end

local lastSummary = nil
local lastRun = -1000.0
local flagCheckedAt = -1000.0
local flagOn = false

local function appendLog(line)
    if ctx.outDir == nil then return end
    local f = io.open(ctx.outDir .. "probe-log.txt", "a")
    if f == nil then return end
    f:write(os.date("%Y-%m-%d %H:%M:%S") .. "  " .. line .. "\n")
    f:close()
end

local function snapshot(pc)
    local ps = get(function(x) return x.PlayerState end, pc)
    if not alive(ps) then ps = nil end
    local params = findAll("PalIndividualCharacterParameter")
    if structure == nil and ps ~= nil then
        structure = describeStructure(pc, ps, params)
        appendLog("probe v" .. ctx.version .. " started; class map written to probe.json")
    end

    local myId = ps and guid(field(ps, "PlayerUId"))
    local pals, groups = {}, {}
    for i = 1, #params do
        local p = readPal(params[i])
        pals[#pals + 1] = p
        local key = p.isPlayer and "players" or (p.container or "no-container")
        local g = groups[key]
        if g == nil then
            g = { count = 0, mine = 0, species = {} }
            groups[key] = g
        end
        g.count = g.count + 1
        if myId ~= nil and p.owner == myId then g.mine = g.mine + 1 end
        if #g.species < 8 and p.species then g.species[#g.species + 1] = p.species end
    end

    local containers = {}
    for _, c in ipairs(findAll("PalIndividualCharacterContainer")) do
        local slots = get(function(x) return x.SlotArray end, c)
        containers[#containers + 1] = {
            object = fullName(c),
            id = guid(get(function(x) return x.ID.ID end, c)),
            slots = slots and (get(function(a) return a:GetArrayNum() end, slots) or get(function(a) return #a end, slots)),
        }
    end
    local counts = {}
    for _, name in ipairs(COUNT_CLASSES) do counts[name] = #findAll(name) end

    -- One log line per change: total, then each group as id(first 8):count/mine
    local keys = {}
    for k in pairs(groups) do keys[#keys + 1] = k end
    table.sort(keys)
    local parts = {}
    for _, k in ipairs(keys) do
        parts[#parts + 1] = string.format("%s=%d/%d", k:sub(1, 8), groups[k].count, groups[k].mine)
    end
    local summary = string.format("pals %d | %s | containers %d", #pals, table.concat(parts, " "), #containers)
    if summary ~= lastSummary then
        lastSummary = summary
        appendLog(summary)
        ctx.log("probe: " .. summary)
    end

    ctx.writeFile("probe.json", encode({
        v = 1, mod = ctx.version, at = os.date("%Y-%m-%d %H:%M:%S"), me = myId,
        groups = groups, containers = containers, counts = counts, pals = pals, structure = structure,
    }))
end

-- Called on the game thread from the bridge's job
function M.tick(pc, now)
    if ctx == nil or ctx.outDir == nil then return end
    if (now - flagCheckedAt) >= FLAG_EVERY then
        flagCheckedAt = now
        local f = io.open(ctx.outDir .. "probe.on", "r")
        flagOn = f ~= nil
        if f then f:close() end
    end
    if not flagOn or (now - lastRun) < PROBE_EVERY then return end
    lastRun = now
    local ok, err = pcall(snapshot, pc)
    if not ok then
        appendLog("snapshot failed: " .. tostring(err))
        ctx.log("probe failed: " .. tostring(err))
    end
end

return M
