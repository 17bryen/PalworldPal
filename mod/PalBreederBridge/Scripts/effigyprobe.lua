-- Effigy probe: finds out what the game records about collected effigies (and journals), and
-- whether those records can be matched to effigies on the map.
-- Only runs while the file %APPDATA%\palbreeder\bridge\effigy-probe.on exists.
--
-- Every few seconds it reads your player record's effigy and journal fields and looks for effigy
-- and journal objects loaded near you, with their ids and positions. When a new collected entry
-- appears in the record (you picked one up), it logs it next to the nearest effigy objects, so the
-- record's keys can be compared with the objects' ids. Files:
--   effigy-probe.json            the latest read
--   effigy-probe-structure.json  the record's fields and the effigy classes' fields, once
--   effigy-probe-log.txt         one line per change

local M = {}

local READ_EVERY = 3.0
local FLAG_EVERY = 3.0
local BROAD_SCAN_AFTER = 20.0   -- seconds after starting, one wide search for effigy-like classes
-- Guesses at the game's effigy and journal object classes, searched each read
local CANDIDATES = { "PalLevelObjectRelic", "PalLevelObjectObtainable", "PalLevelObjectNote", "BP_LevelObject_Relic_C", "BP_LevelObject_Note_C", "PalMapObjectRelic" }
local INTERESTING = { "relic", "effig", "note", "obtain", "collect", "journal" }

local ctx, get, alive = nil, nil, nil
local enabled = false
local flagCheckedAt = -1000.0
local lastRead = -1000.0
local startedAt = nil
local broadDone = false
local structureWritten = false
local knownKeys = nil           -- record key -> true, from the previous read
local foundClasses = {}         -- class name -> count, from the wide search
local extraClasses = {}         -- classes the wide search turned up, searched from then on
local propCache = {}            -- class name -> { {name, kind}, ... }

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
local function interesting(name)
    local lower = name:lower()
    for _, w in ipairs(INTERESTING) do if lower:find(w, 1, true) then return true end end
    return false
end

-- A value read from the game as text: names, strings, GUIDs, numbers, booleans
local function text(v)
    if v == nil then return nil end
    local t = type(v)
    if t == "number" or t == "boolean" or t == "string" then return tostring(v) end
    local s = get(function(x) return x:ToString() end, v)
    if type(s) == "string" then return s end
    local g = get(function(x)
        return string.format("%08x%08x%08x%08x", math.tointeger(x.A) & 0xffffffff, math.tointeger(x.B) & 0xffffffff,
            math.tointeger(x.C) & 0xffffffff, math.tointeger(x.D) & 0xffffffff)
    end, v)
    if g then return g end
    local inner = get(function(x) return x:get() end, v)
    if inner ~= nil and inner ~= v then return text(inner) end
    return tostring(v)
end

-- Every property of an object's class chain, cached per class
local function props(obj)
    local cls = get(function(o) return o:GetClass() end, obj)
    local key = cls and fname(cls) or "?"
    if propCache[key] then return propCache[key], key end
    local list = {}
    for _ = 1, 10 do
        if cls == nil or not alive(cls) then break end
        local owner = fname(cls) or "?"
        pcall(function()
            cls:ForEachProperty(function(p)
                list[#list + 1] = { name = fname(p) or "?", kind = get(function(q) return q:GetClass():GetFName():ToString() end, p) or "?", owner = owner }
            end)
        end)
        if owner == "Actor" or owner == "Object" then break end
        cls = get(function(c) return c:GetSuperStruct() end, cls)
    end
    propCache[key] = list
    return list, key
end

-- The entries of a map property, as text
local function mapEntries(map)
    local out = {}
    pcall(function()
        map:ForEach(function(k, v)
            out[#out + 1] = { key = text(k), value = text(v) }
        end)
    end)
    return out
end

local function arrayEntries(arr)
    local out = {}
    pcall(function()
        arr:ForEach(function(_, e) out[#out + 1] = text(e) end)
    end)
    return out
end

-- ---- The player record ----

local function readRecord(pc)
    local ps = get(function(p) return p.PlayerState end, pc)
    local rd = ps and get(function(p) return p.RecordData end, ps)
    if rd == nil or not alive(rd) then return nil end
    local list = props(rd)
    local fields, keys = {}, {}
    for _, p in ipairs(list) do
        if interesting(p.name) then
            local v = get(function(o) return o[p.name] end, rd)
            local entry = { kind = p.kind }
            if p.kind == "MapProperty" then
                local entries = v and mapEntries(v) or {}
                entry.count = #entries
                entry.sample = {}
                for i = 1, math.min(#entries, 12) do entry.sample[i] = entries[i].key .. " = " .. tostring(entries[i].value) end
                for _, e in ipairs(entries) do keys[p.name .. ":" .. tostring(e.key)] = tostring(e.value) end
            elseif p.kind == "ArrayProperty" or p.kind == "SetProperty" then
                local entries = v and arrayEntries(v) or {}
                entry.count = #entries
                entry.sample = { table.unpack(entries, 1, math.min(#entries, 12)) }
                for _, e in ipairs(entries) do keys[p.name .. ":" .. tostring(e)] = "in" end
            else
                entry.value = text(v)
            end
            fields[p.name] = entry
        end
    end
    return { fields = fields, keys = keys, record = rd }
end

-- ---- Effigy and journal objects near you ----

local function readObject(obj, me)
    local list, cls = props(obj)
    local row = { class = cls, ids = {}, flags = {} }
    local loc = get(function(o) return o:K2_GetActorLocation() end, obj)
    if loc then
        row.x, row.y, row.z = loc.X, loc.Y, loc.Z
        if me then row.m = math.sqrt((loc.X - me.X) ^ 2 + (loc.Y - me.Y) ^ 2 + (loc.Z - me.Z) ^ 2) / 100 end
    end
    for _, p in ipairs(list) do
        local lower = p.name:lower()
        if lower:match("id$") or lower:find("guid", 1, true) or lower:find("instanceid", 1, true) then
            if p.kind ~= "ObjectProperty" and p.kind ~= "MulticastInlineDelegateProperty" and p.kind ~= "ArrayProperty" and p.kind ~= "MapProperty" then
                row.ids[p.name] = text(get(function(o) return o[p.name] end, obj))
            end
        elseif p.kind == "BoolProperty" and (interesting(p.name) or lower:find("hidden", 1, true) or lower:find("pick", 1, true)) then
            row.flags[p.name] = get(function(o) return o[p.name] end, obj)
        end
    end
    row.name = get(function(o) return o:GetFullName() end, obj)
    return row
end

local function findObjects(me)
    local rows, counts = {}, {}
    local names = {}
    for _, n in ipairs(CANDIDATES) do names[#names + 1] = n end
    for n in pairs(extraClasses) do names[#names + 1] = n end
    local seen = {}
    for _, n in ipairs(names) do
        local found = get(FindAllOf, n)
        counts[n] = type(found) == "table" and #found or 0
        if type(found) == "table" then
            for _, o in ipairs(found) do
                local addr = get(function(x) return x:GetAddress() end, o)
                if alive(o) and addr and not seen[addr] then
                    seen[addr] = true
                    rows[#rows + 1] = readObject(o, me)
                end
            end
        end
    end
    table.sort(rows, function(a, b) return (a.m or 1e9) < (b.m or 1e9) end)
    return rows, counts
end

-- One wide search of every actor for effigy- or journal-like class names (a one-off hitch)
local function broadScan()
    broadDone = true
    local started = os.clock()
    local all = get(FindAllOf, "Actor")
    local n = type(all) == "table" and #all or 0
    for i = 1, n do
        local cls = get(function(o) return o:GetClass() end, all[i])
        local name = cls and fname(cls)
        if name and interesting(name) then
            foundClasses[name] = (foundClasses[name] or 0) + 1
            extraClasses[name] = true
        end
    end
    appendLog(string.format("wide search: %d actors in %.0f ms; effigy-like classes %s", n, (os.clock() - started) * 1000, encode(foundClasses)))
end

local function playerLocation(pc)
    local pawn = pc and get(function(p) return p.Pawn end, pc)
    if pawn == nil or not alive(pawn) then return nil end
    return get(function(p) return p:K2_GetActorLocation() end, pawn)
end

local function read(pc, now)
    lastRead = now
    local started = os.clock()
    local me = playerLocation(pc)
    local record = readRecord(pc)
    local objects, counts = findObjects(me)

    if record and not structureWritten then
        structureWritten = true
        local recordProps = {}
        for _, p in ipairs(props(record.record)) do recordProps[#recordProps + 1] = p.name .. ":" .. p.kind end
        local objectProps = {}
        for cls, list in pairs(propCache) do
            if cls ~= "?" and interesting(cls) then
                local names = {}
                for _, p in ipairs(list) do names[#names + 1] = p.owner .. "." .. p.name .. ":" .. p.kind end
                objectProps[cls] = names
            end
        end
        ctx.writeFile("effigy-probe-structure.json", encode({ record = recordProps, objects = objectProps }))
    end

    -- Something new in the record: you just picked one up. Log it beside the nearest objects.
    if record then
        if knownKeys then
            for k, v in pairs(record.keys) do
                if knownKeys[k] == nil or knownKeys[k] ~= v then
                    local near = {}
                    for i = 1, math.min(3, #objects) do near[i] = objects[i] end
                    appendLog("record changed: " .. k .. " = " .. tostring(v) .. "; player " .. (me and string.format("%.0f,%.0f,%.0f", me.X, me.Y, me.Z) or "?") .. "; nearest " .. encode(near))
                end
            end
        else
            local n = 0
            for _ in pairs(record.keys) do n = n + 1 end
            appendLog("first record read: " .. n .. " entries; fields " .. encode(record.fields))
        end
        knownKeys = record.keys
    end

    local ms = (os.clock() - started) * 1000
    ctx.writeFile("effigy-probe.json", encode({
        at = os.date("%H:%M:%S"), readMs = ms, player = me and { x = me.X, y = me.Y, z = me.Z },
        record = record and record.fields or "no record data", classCounts = counts, wideSearch = foundClasses,
        objects = { table.unpack(objects, 1, math.min(#objects, 40)) }
    }))
    if (now - startedAt) < 60 or #objects > 0 then
        appendLog(string.format("read in %.0f ms: %d effigy-like objects loaded, nearest %s m; class counts %s", ms, #objects,
            objects[1] and objects[1].m and string.format("%.0f", objects[1].m) or "-", encode(counts)))
    end
end

function M.setup(c)
    ctx, get, alive = c, c.get, c.alive
end

function M.reset()
    knownKeys = nil
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
    if startedAt == nil then
        startedAt = now
        appendLog("probe started")
    end
    if not broadDone and (now - startedAt) >= BROAD_SCAN_AFTER then
        local ok, err = pcall(broadScan)
        if not ok then appendLog("wide search failed: " .. tostring(err)) end
        return
    end
    if (now - lastRead) >= READ_EVERY then
        local ok, err = pcall(read, pc, now)
        if not ok then appendLog("read failed: " .. tostring(err)) end
    end
end

return M
