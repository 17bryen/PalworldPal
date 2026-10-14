-- Pal sync: lists the player's own pals for the app's "My pals" list.
--
-- Every pal the client knows about is a PalIndividualCharacterParameter whose SaveParameter holds
-- its species, gender, passives and IVs. Pals in your party or Palbox are the ones you own. A pal
-- you put to work at a base (or into storage) loses its owner, but keeps you in its list of
-- previous owners, so those are reported too, as "other"; other players' and wild pals are not.
-- On a server, the Palbox only sends the pages you open, so pals show up as you browse it.
--
-- Finding those objects means scanning every object in the game, which stalls a frame, so scans
-- only happen while a menu is open (the Palbox is one), plus once shortly after joining. Each
-- scan is followed by a read pass done a few pals per game-thread job. Writes pals.json when the
-- list changes.
--
-- Each pal also says where it is: "in" is party, box or other, "s" the slot index. The party
-- container belongs to your PlayerController and the Palbox to your PlayerState; which container
-- is which is worked out with one more scan, only when a pal turns up in a container not seen
-- before. "id" is the game's own id for the pal, which stays the same through anything that
-- happens to it.

local M = {}

local SCAN_EVERY = 5.0      -- seconds between scans while a menu is open
local SLOW_SCAN_EVERY = 15  -- ...when a scan took longer than SLOW_SCAN_MS
local SLOW_SCAN_MS = 150
local FIRST_SCAN_AFTER = 15 -- seconds after joining; covers the party without opening a menu
local CLOSE_SCAN_AFTER = 1  -- one more scan this long after a menu closes, for last moves
local BATCH = 25            -- pals read per job

local ctx = nil
local get, alive = nil, nil
local me = nil -- your player id, read when a scan starts
-- Changes whenever the mod starts over (game start, new world or character); the app only compares
-- reads from the same session, so pals left over from an earlier one never look like they vanished
local session = string.format("%x-%x", os.time(), math.random(0, 0xffffff))

function M.setup(c)
    ctx = c
    get, alive = c.get, c.alive
end

local function guid(g)
    if g == nil then return nil end
    local ok, s = pcall(function()
        return string.format("%08x%08x%08x%08x", math.tointeger(g.A) & 0xffffffff, math.tointeger(g.B) & 0xffffffff,
            math.tointeger(g.C) & 0xffffffff, math.tointeger(g.D) & 0xffffffff)
    end)
    if ok then return s end
    return nil
end
local NO_ID = "00000000000000000000000000000000"

local function readOwner(ps) return ps.PlayerUId end
local function readSave(param) return param.SaveParameter end
local function readInstanceId(param) return param.IndividualId.InstanceId end
local function readSpecies(sp) return sp.CharacterID:ToString() end
local function readOwnerId(sp) return sp.OwnerPlayerUId end
local function readContainer(sp) return sp.SlotID.ContainerId.ID end
local function readSlot(sp) return sp.SlotID.SlotIndex end
local function readContainerId(c) return c.ID.ID end
local function fullName(o) return o:GetFullName() end
local function readOldOwners(sp)
    local ids = {}
    sp.OldOwnerPlayerUIds:ForEach(function(_, e) ids[#ids + 1] = guid(e:get()) end)
    return ids
end

-- Container id -> "party" or "box", and whether a pal sat in one we couldn't place
local containerKind = {}
local unknownContainer = true
-- Whether the game let us read pal ids and previous owners at least once; the app only removes
-- pals that leave the Palbox when it knows bases and storage would have been seen
local readIds, readOldOwnerLists = false, false

-- "Class /Path.To:Object" -> "/Path.To:Object"
local function objectPath(o)
    local name = get(fullName, o)
    return name and name:match("^%S+%s+(.+)$") or nil
end

local function resolveContainers(pc, ps)
    unknownContainer = false
    local pcPath, psPath = objectPath(pc), objectPath(ps)
    local found = get(FindAllOf, "PalIndividualCharacterContainer")
    if type(found) ~= "table" or pcPath == nil or psPath == nil then return end
    for i = 1, #found do
        local c = found[i]
        local name = alive(c) and get(fullName, c) or nil
        local id = name and guid(get(readContainerId, c)) or nil
        if id ~= nil then
            if name:find(pcPath .. ".", 1, true) then containerKind[id] = "party"
            elseif name:find(psPath .. ".", 1, true) then containerKind[id] = "box" end
        end
    end
end

-- Which world or server this is, so the app keeps each one's pals apart. The game state carries a
-- world id on most setups; the player id is the fallback (a local host always gets the same one,
-- so it still tells servers from local saves).
local WORLD_FIELDS = { "WorldGUID", "WorldSaveDirectoryName", "WorldName", "ServerName" }
local world = nil
local function readWorld()
    local gs = get(FindFirstOf, "PalGameStateInGame")
    local found, label = nil, nil
    if gs ~= nil and alive(gs) then
        for _, f in ipairs(WORLD_FIELDS) do
            local v = get(function(o) return o[f] end, gs)
            local s = v ~= nil and (get(function(x) return x:ToString() end, v) or guid(v) or (type(v) == "string" and v)) or nil
            if type(s) == "string" and s ~= "" and s ~= NO_ID then
                if found == nil then found = s end
                if label == nil and (f == "WorldName" or f == "ServerName") then label = s end
            end
        end
    end
    world = { id = (found or "") .. "|" .. me, name = label or "" }
    ctx.log("world: " .. world.id .. (label and (" (" .. label .. ")") or ""))
end

local function readGender(sp) return sp.Gender end
local function readTalents(sp) return sp.Talent_HP, sp.Talent_Shot, sp.Talent_Defense end
local function readLevel(sp) return sp.Level end
local function readName(sp) return sp.NickName:ToString() end
-- Condensation (1 = no stars, 5 = four stars) and Pal Soul ranks for HP, attack and defense
local function readRanks(sp) return sp.Rank, sp.Rank_HP, sp.Rank_Attack, sp.Rank_Defence end
local function readPassives(sp)
    local names = {}
    sp.PassiveSkillList:ForEach(function(_, e) names[#names + 1] = e:get():ToString() end)
    return names
end

-- Names here come from the game's own ids, but keep the JSON valid whatever they hold
local function quote(s)
    return '"' .. s:gsub('[%c"\\]', "") .. '"'
end

-- A player's text (pal nicknames), escaped so every character survives as JSON
local JSON_ESCAPES = { ['"'] = '\\"', ['\\'] = '\\\\' }
local function jsonString(s)
    return '"' .. s:gsub('[%c"\\]', function(ch) return JSON_ESCAPES[ch] or string.format('\\u%04x', ch:byte()) end) .. '"'
end

-- Yours but out of the party and Palbox: in your list of previous owners
local function formerlyMine(sp)
    local ok, ids = pcall(readOldOwners, sp)
    if not ok then return false end
    readOldOwnerLists = true
    for i = 1, #ids do
        if ids[i] == me then return true end
    end
    return false
end

-- One pal as JSON, or nil when it isn't yours or its data hasn't arrived yet
local function readPal(param)
    if not alive(param) then return nil end
    local sp = get(readSave, param)
    if sp == nil then return nil end
    local container = guid(get(readContainer, sp))
    if container == nil or container == NO_ID then return nil end
    local kind
    if guid(get(readOwnerId, sp)) == me then
        kind = containerKind[container]
        if kind == nil then
            unknownContainer = true
            kind = "?"
        end
    elseif formerlyMine(sp) then
        kind = "other"
    else
        return nil
    end
    local species = get(readSpecies, sp)
    if species == nil or species == "None" then return nil end
    local id = guid(get(readInstanceId, param))
    if id ~= nil and id ~= NO_ID then readIds = true else id = "" end
    local gender = get(readGender, sp)
    local ok, hp, shot, def = pcall(readTalents, sp)
    if not ok then hp, shot, def = 0, 0, 0 end
    local passives = get(readPassives, sp) or {}
    for i = 1, #passives do passives[i] = quote(passives[i]) end
    local slot = math.tointeger(get(readSlot, sp)) or -1
    local level = math.tointeger(get(readLevel, sp)) or 0
    local okRanks, rank, rankHp, rankAtk, rankDef = pcall(readRanks, sp)
    if not okRanks then rank, rankHp, rankAtk, rankDef = 0, 0, 0, 0 end
    local name = get(readName, sp) or ""
    return string.format('{"id":"%s","c":%s,"g":%d,"p":[%s],"iv":[%d,%d,%d],"in":"%s","s":%d,"lv":%d,"r":%d,"sr":[%d,%d,%d],"n":%s}', id,
        quote(species), math.tointeger(gender) or 0, table.concat(passives, ","), math.tointeger(hp) or 0, math.tointeger(shot) or 0,
        math.tointeger(def) or 0, kind, slot, level, math.tointeger(rank) or 0, math.tointeger(rankHp) or 0, math.tointeger(rankAtk) or 0,
        math.tointeger(rankDef) or 0, jsonString(name))
end

-- Scheduling (game thread only)
local joinedAt = nil
local lastScan = -1000.0
local slow = false
local wasUi = false
local closedAt = nil
local scanned = nil   -- objects from the last scan, waiting to be read
local readAt = 1
local entries = nil
local lastList = nil
local scanMs = 0
local scansLogged = 0

local function scan(now)
    lastScan = now
    local started = os.clock()
    local found = get(FindAllOf, "PalIndividualCharacterParameter")
    scanMs = (os.clock() - started) * 1000
    slow = scanMs > SLOW_SCAN_MS
    if scansLogged < 3 then
        scansLogged = scansLogged + 1
        ctx.log(string.format("pal scan: %d objects in %.1f ms", type(found) == "table" and #found or 0, scanMs))
    end
    if type(found) ~= "table" then return end
    scanned, readAt, entries = found, 1, {}
end

local function finishPass()
    table.sort(entries)
    local list = table.concat(entries, ",")
    scanned, entries = nil, nil
    local head = string.format('"session":"%s","world":{"id":%s,"name":%s},"ok":{"id":%s,"old":%s}', session, jsonString(world.id),
        jsonString(world.name), tostring(readIds), tostring(readOldOwnerLists))
    -- The scan time rides along but doesn't count as a change
    if head .. list == lastList then return end
    local text = string.format('{"v":1,"mod":"%s","scanMs":%.1f,%s,"pals":[%s]}', ctx.version, scanMs, head, list)
    if ctx.writeFile("pals.json", text) then lastList = head .. list end
end

-- Called on the game thread from the bridge's job; does a scan or one batch of reads at most
function M.tick(pc, now, ui)
    if ctx == nil then return end
    if scanned ~= nil then
        local stop = math.min(readAt + BATCH - 1, #scanned)
        for i = readAt, stop do
            local entry = readPal(scanned[i])
            if entry ~= nil then entries[#entries + 1] = entry end
        end
        readAt = stop + 1
        if readAt > #scanned then finishPass() end
        return
    end

    if joinedAt == nil then joinedAt = now end
    if wasUi and not ui then closedAt = now end
    wasUi = ui
    local every = slow and SLOW_SCAN_EVERY or SCAN_EVERY
    local due = (ui and now - lastScan >= every)
        or (closedAt ~= nil and now - closedAt >= CLOSE_SCAN_AFTER)
        or (lastScan < 0 and now - joinedAt >= FIRST_SCAN_AFTER)
    if not due then return end
    closedAt = nil
    local ps = get(function(x) return x.PlayerState end, pc)
    me = alive(ps) and guid(get(readOwner, ps)) or nil
    if me == nil or me == NO_ID then return end
    if world == nil then readWorld() end
    if unknownContainer then resolveContainers(pc, ps) end
    scan(now)
end

-- The world's id once known, for the other bridge files
function M.worldId()
    return world and world.id or nil
end

-- A new world or character: start over
function M.reset()
    joinedAt, lastScan, wasUi, closedAt = nil, -1000.0, false, nil
    containerKind, unknownContainer = {}, true
    readIds, readOldOwnerLists, world = false, false, nil
    session = string.format("%x-%x", os.time(), math.random(0, 0xffffff))
    scanned, entries, me, lastList = nil, nil, nil, nil
end

return M
