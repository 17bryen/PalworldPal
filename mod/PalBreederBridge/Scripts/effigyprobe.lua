-- Effigy probe, round 2: reads which effigies and journals you've collected, two ways, and checks
-- they agree. Only runs while the file %APPDATA%\palbreeder\bridge\effigy-probe.on exists.
--
-- Round 1 showed every effigy and journal object is loaded all the time (577 of them), each with a
-- LevelObjectInstanceId, a RelicType and a bPickedInClient flag, and that the player record keeps
-- RelicObtainForInstanceFlag_<bonus> and NoteObtainForInstanceFlag lists. This round:
--   * finds the objects once, then every few seconds re-reads only their bPickedInClient flags
--   * opens the record's lists through their struct layouts and reads every key
--   * compares the picked flags with the record's keys and logs every change
-- Files (never overwritten by an empty read):
--   effigy-probe.json          the summary: counts per type, flags vs record, a few samples
--   effigy-probe-objects.json  every object: class, type, id, position, picked
--   effigy-probe-record.json   the record lists' layouts and every key
--   effigy-probe-log.txt       one line per change

local M = {}

local READ_EVERY = 5.0
local FLAG_EVERY = 3.0
local CLASSES = {
    "BP_LevelObject_Relic_C", "BP_LevelObject_Relic_FlameBambi_C", "BP_LevelObject_Relic_GuardianDog_C",
    "BP_LevelObject_Relic_IceCrocodile_C", "BP_LevelObject_Relic_LazyDragon_C", "BP_LevelObject_Relic_LeafMomonga_C",
    "BP_LevelObject_Relic_Monkey_C", "BP_LevelObject_Relic_Mutant_C", "BP_LevelObject_Relic_NegativeKoala_C",
    "BP_LevelObject_Relic_Penguin_C", "BP_LevelObject_Relic_PinkCat_C", "BP_LevelObject_Relic_SheepBall_C",
    "BP_LevelObject_Note_C",
}

local ctx, get, alive = nil, nil, nil
local enabled = false
local flagCheckedAt = -1000.0
local lastRead = -1000.0
local objects = nil          -- { obj, class, type, id, x, y, z, picked }
local recordKeys = nil       -- record list name -> { key -> value }
local recordLayoutWritten = false

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
    local f = io.open(ctx.outDir .. "effigy-probe-log.txt", "a")
    if f == nil then return end
    f:write(os.date("%H:%M:%S") .. "  " .. line .. "\n")
    f:close()
end

local function fname(o) return get(function(x) return x:GetFName():ToString() end, o) end

local function guidText(x)
    return string.format("%08x%08x%08x%08x", math.tointeger(x.A) & 0xffffffff, math.tointeger(x.B) & 0xffffffff,
        math.tointeger(x.C) & 0xffffffff, math.tointeger(x.D) & 0xffffffff)
end

-- A value read from the game as text: GUIDs (directly or one struct level down), names, numbers
local function text(v)
    if v == nil then return nil end
    local t = type(v)
    if t == "number" or t == "boolean" or t == "string" then return tostring(v) end
    local g = get(guidText, v)
    if g then return g end
    for _, inner in ipairs({ "Guid", "ID", "Id", "InstanceId", "Value" }) do
        local iv = get(function(x) return x[inner] end, v)
        if iv ~= nil and iv ~= v then
            local s = get(guidText, iv)
            if s then return s end
        end
    end
    local s = get(function(x) return x:ToString() end, v)
    if type(s) == "string" then return s end
    local unwrapped = get(function(x) return x:get() end, v)
    if unwrapped ~= nil and unwrapped ~= v then return text(unwrapped) end
    return tostring(v)
end

-- ---- The effigy and journal objects ----

local function findObjects()
    local list = {}
    local started = os.clock()
    for _, cls in ipairs(CLASSES) do
        local found = get(FindAllOf, cls)
        if type(found) == "table" then
            for _, o in ipairs(found) do
                if alive(o) then
                    local loc = get(function(a) return a:K2_GetActorLocation() end, o)
                    list[#list + 1] = {
                        obj = o,
                        class = cls,
                        type = text(get(function(a) return a.RelicType end, o)) or (cls:find("Note") and "Note" or "?"),
                        id = text(get(function(a) return a.LevelObjectInstanceId end, o)),
                        x = loc and loc.X, y = loc and loc.Y, z = loc and loc.Z,
                    }
                end
            end
        end
    end
    appendLog(string.format("found %d effigy and journal objects in %.0f ms", #list, (os.clock() - started) * 1000))
    return list
end

local function readPicked()
    local changed = {}
    -- Leaving the world unloads them all; that isn't every effigy being un-collected
    local any = false
    for _, e in ipairs(objects) do if alive(e.obj) then any = true break end end
    if not any then return nil end
    for _, e in ipairs(objects) do
        local picked = alive(e.obj) and get(function(a) return a.bPickedInClient end, e.obj) == true or false
        if e.picked ~= nil and e.picked ~= picked then changed[#changed + 1] = e end
        e.picked = picked
    end
    return changed
end

-- ---- The record's collected lists ----

-- A struct's fields, from the record class's property for it
local function structLayout(prop)
    local st = get(function(p) return p:GetStruct() end, prop)
    local fields = {}
    if st then
        pcall(function()
            st:ForEachProperty(function(f)
                fields[#fields + 1] = { name = fname(f) or "?", kind = get(function(q) return q:GetClass():GetFName():ToString() end, f) or "?" }
            end)
        end)
    end
    return fields, st and fname(st) or "?"
end

local function entriesOf(value, kind)
    local out = {}
    if kind == "MapProperty" then
        pcall(function() value:ForEach(function(k, v) out[#out + 1] = { text(k), text(v) } end) end)
    elseif kind == "ArrayProperty" or kind == "SetProperty" then
        pcall(function() value:ForEach(function(_, e) out[#out + 1] = { text(e), "in" } end) end)
    end
    return out
end

local function readRecord(pc)
    local ps = get(function(p) return p.PlayerState end, pc)
    local rd = ps and get(function(p) return p.RecordData end, ps)
    if rd == nil or not alive(rd) then return nil, nil end
    local cls = get(function(o) return o:GetClass() end, rd)
    local lists, layouts = {}, {}
    pcall(function()
        cls:ForEachProperty(function(p)
            local name = fname(p) or "?"
            if name:find("RelicObtainForInstanceFlag", 1, true) or name == "NoteObtainForInstanceFlag" or name == "RelicPossessNumArray" then
                local kind = get(function(q) return q:GetClass():GetFName():ToString() end, p) or "?"
                local value = get(function(o) return o[name] end, rd)
                local keys = {}
                if kind == "StructProperty" then
                    local fields, structName = structLayout(p)
                    layouts[name] = { struct = structName, fields = fields }
                    for _, f in ipairs(fields) do
                        local inner = value and get(function(v) return v[f.name] end, value)
                        for _, e in ipairs(inner and entriesOf(inner, f.kind) or {}) do keys[f.name .. "|" .. tostring(e[1])] = tostring(e[2]) end
                    end
                else
                    layouts[name] = { kind = kind }
                    for _, e in ipairs(value and entriesOf(value, kind) or {}) do keys[tostring(e[1])] = tostring(e[2]) end
                end
                lists[name] = keys
            end
        end)
    end)
    return lists, layouts
end

-- ---- Comparing ----

local function bareKey(k) return (k:gsub("^[^|]*|", "")) end

local function summarize(lists)
    local byType, pickedIds = {}, {}
    for _, e in ipairs(objects) do
        local t = byType[e.type] or { total = 0, picked = 0 }
        t.total = t.total + 1
        if e.picked then
            t.picked = t.picked + 1
            if e.id then pickedIds[e.id] = e end
        end
        byType[e.type] = t
    end
    local recordIds, recordCounts = {}, {}
    for name, keys in pairs(lists or {}) do
        local n = 0
        for k, v in pairs(keys) do
            n = n + 1
            if v ~= "false" then recordIds[bareKey(k)] = name end
        end
        recordCounts[name] = n
    end
    local both, onlyFlag, onlyRecord = 0, 0, 0
    local onlyFlagSample, onlyRecordSample = {}, {}
    for id, e in pairs(pickedIds) do
        if recordIds[id] then both = both + 1 else
            onlyFlag = onlyFlag + 1
            if #onlyFlagSample < 5 then onlyFlagSample[#onlyFlagSample + 1] = { id = id, type = e.type } end
        end
    end
    local objectIds = {}
    for _, e in ipairs(objects) do if e.id then objectIds[e.id] = true end end
    for id, name in pairs(recordIds) do
        if not pickedIds[id] then
            onlyRecord = onlyRecord + 1
            if #onlyRecordSample < 5 then onlyRecordSample[#onlyRecordSample + 1] = { id = id, list = name, isAnObjectId = objectIds[id] == true } end
        end
    end
    return {
        byType = byType, recordCounts = recordCounts,
        pickedFlagAndInRecord = both, pickedFlagOnly = onlyFlag, inRecordOnly = onlyRecord,
        pickedFlagOnlySample = onlyFlagSample, inRecordOnlySample = onlyRecordSample,
    }
end

local function playerLocation(pc)
    local pawn = pc and get(function(p) return p.Pawn end, pc)
    if pawn == nil or not alive(pawn) then return nil end
    return get(function(p) return p:K2_GetActorLocation() end, pawn)
end

local function read(pc, now)
    lastRead = now
    local started = os.clock()
    if objects == nil or #objects == 0 then
        objects = findObjects()
        if #objects == 0 then return end
    end
    local flips = readPicked()
    if flips == nil then
        objects = nil
        return
    end
    local lists, layouts = readRecord(pc)
    local ms = (os.clock() - started) * 1000
    local me = playerLocation(pc)

    for _, e in ipairs(flips) do
        local d = me and e.x and math.sqrt((e.x - me.X) ^ 2 + (e.y - me.Y) ^ 2) / 100
        appendLog(string.format("picked flag changed: %s %s id %s at %.0f,%.0f now %s (%s m from you)", e.class, e.type, tostring(e.id), e.x or 0, e.y or 0,
            tostring(e.picked), d and string.format("%.0f", d) or "?"))
    end
    if lists then
        if recordKeys then
            for name, keys in pairs(lists) do
                for k, v in pairs(keys) do
                    local before = recordKeys[name] and recordKeys[name][k]
                    if before ~= v then appendLog("record changed: " .. name .. " " .. k .. " = " .. v .. (before and (" (was " .. before .. ")") or " (new)")) end
                end
            end
        end
        recordKeys = lists
        if not recordLayoutWritten then
            recordLayoutWritten = true
            ctx.writeFile("effigy-probe-record.json", encode({ layouts = layouts, lists = lists }))
        end
    end

    local summary = summarize(lists)
    summary.at = os.date("%H:%M:%S")
    summary.readMs = ms
    summary.objects = #objects
    summary.recordRead = lists ~= nil
    ctx.writeFile("effigy-probe.json", encode(summary))
    if #flips > 0 or not M.wroteObjects then
        M.wroteObjects = true
        local rows = {}
        for i, e in ipairs(objects) do rows[i] = { class = e.class, type = e.type, id = e.id, x = e.x, y = e.y, z = e.z, picked = e.picked } end
        ctx.writeFile("effigy-probe-objects.json", encode(rows))
        if lists then ctx.writeFile("effigy-probe-record.json", encode({ layouts = layouts, lists = lists })) end
    end
    appendLog(string.format("read in %.1f ms: %d objects; picked flags %s; record lists %s; flag and record agree on %d, flag only %d, record only %d",
        ms, #objects, encode(summary.byType), encode(summary.recordCounts), summary.pickedFlagAndInRecord, summary.pickedFlagOnly, summary.inRecordOnly))
end

function M.setup(c)
    ctx, get, alive = c, c.get, c.alive
end

-- A new world or character: find the objects again
function M.reset()
    objects, recordKeys = nil, nil
    recordLayoutWritten = false
    M.wroteObjects = false
end

-- Called on the game thread from the bridge's job
function M.tick(pc, now)
    if ctx == nil or ctx.outDir == nil then return end
    if (now - flagCheckedAt) >= FLAG_EVERY then
        flagCheckedAt = now
        local f = io.open(ctx.outDir .. "effigy-probe.on", "r")
        enabled = f ~= nil
        if f then f:close() end
    end
    if not enabled or pc == nil then return end
    if (now - lastRead) >= READ_EVERY then
        local ok, err = pcall(read, pc, now)
        if not ok then appendLog("read failed: " .. tostring(err)) end
    end
end

return M
