-- Pal sync: lists the player's own pals (party and Palbox) for the app's "My pals" list.
--
-- Every pal the client knows about is a PalIndividualCharacterParameter whose SaveParameter holds
-- its species, gender, passives and IVs. Pals in your party or Palbox are the ones you own; base
-- workers, wild pals and other players' pals have a different owner. On a server, the Palbox only
-- sends the pages you open, so pals show up as you browse it.
--
-- Finding those objects means scanning every object in the game, which stalls a frame, so scans
-- only happen while a menu is open (the Palbox is one), plus once shortly after joining. Each
-- scan is followed by a read pass done a few pals per game-thread job. Writes pals.json when the
-- list changes.

local M = {}

local SCAN_EVERY = 5.0      -- seconds between scans while a menu is open
local SLOW_SCAN_EVERY = 15  -- ...when a scan took longer than SLOW_SCAN_MS
local SLOW_SCAN_MS = 150
local FIRST_SCAN_AFTER = 15 -- seconds after joining; covers the party without opening a menu
local CLOSE_SCAN_AFTER = 1  -- one more scan this long after a menu closes, for last moves
local BATCH = 25            -- pals read per job

local ctx = nil
local get, alive = nil, nil

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
local function readSpecies(sp) return sp.CharacterID:ToString() end
local function readOwnerId(sp) return sp.OwnerPlayerUId end
local function readContainer(sp) return sp.SlotID.ContainerId.ID end
local function readGender(sp) return sp.Gender end
local function readTalents(sp) return sp.Talent_HP, sp.Talent_Shot, sp.Talent_Defense end
local function readPassives(sp)
    local names = {}
    sp.PassiveSkillList:ForEach(function(_, e) names[#names + 1] = e:get():ToString() end)
    return names
end

-- Names here come from the game's own ids, but keep the JSON valid whatever they hold
local function quote(s)
    return '"' .. s:gsub('[%c"\\]', "") .. '"'
end

-- One pal as JSON, or nil when it isn't yours or its data hasn't arrived yet
local function readPal(param, me)
    if not alive(param) then return nil end
    local sp = get(readSave, param)
    if sp == nil then return nil end
    if guid(get(readOwnerId, sp)) ~= me then return nil end
    local container = guid(get(readContainer, sp))
    if container == nil or container == NO_ID then return nil end
    local species = get(readSpecies, sp)
    if species == nil or species == "None" then return nil end
    local gender = get(readGender, sp)
    local ok, hp, shot, def = pcall(readTalents, sp)
    if not ok then hp, shot, def = 0, 0, 0 end
    local passives = get(readPassives, sp) or {}
    for i = 1, #passives do passives[i] = quote(passives[i]) end
    return string.format('{"c":%s,"g":%d,"p":[%s],"iv":[%d,%d,%d]}', quote(species), math.tointeger(gender) or 0,
        table.concat(passives, ","), math.tointeger(hp) or 0, math.tointeger(shot) or 0, math.tointeger(def) or 0)
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
local me = nil
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
    -- The scan time rides along but doesn't count as a change
    if list == lastList then return end
    local text = string.format('{"v":1,"mod":"%s","scanMs":%.1f,"pals":[%s]}', ctx.version, scanMs, list)
    if ctx.writeFile("pals.json", text) then lastList = list end
end

-- Called on the game thread from the bridge's job; does a scan or one batch of reads at most
function M.tick(pc, now, ui)
    if ctx == nil then return end
    if scanned ~= nil then
        local stop = math.min(readAt + BATCH - 1, #scanned)
        for i = readAt, stop do
            local entry = readPal(scanned[i], me)
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
    scan(now)
end

-- A new world or character: start over
function M.reset()
    joinedAt, lastScan, wasUi, closedAt = nil, -1000.0, false, nil
    scanned, entries, me = nil, nil, nil
end

return M
