-- Nearby wild pals: which ones the game has loaded around you, and where they are.
--
-- The game tells us as it creates each pal character (NotifyOnNewObject), so nothing is scanned
-- except once when a world loads, for the ones already there. Each character's data (species,
-- level, passives, owner) comes through its CharacterParameterComponent; owned pals (yours, at
-- bases, other players') are set aside once and only checked for despawning after that. Every
-- couple of seconds the wild ones' positions are read and written to wild.json:
--   {"v":1,"mod":"1.9.0","pals":[{"c":"SheepBall","x":..,"y":..,"z":..,"lv":5,"g":1,"l":true},..]}
-- "c" keeps the game's id, so alphas carry their BOSS_ prefix; "l" marks a lucky pal.

local M = {}

local READ_EVERY = 2.0
local LINK_FOR = 20.0      -- seconds to keep trying to find a new character's data
local NO_ID = "00000000000000000000000000000000"
local CHARACTER = "/Script/Pal.PalMonsterCharacter"

local ctx, get, alive = nil, nil, nil
local pending = {}         -- characters created since the last read, filled from the game's callback
local tracked = {}         -- address -> { actor, since, wild?, c, lv, g, l }
local seeded = false
local lastRead = -1000.0
local lastText = nil

local function readAddress(o) return o:GetAddress() end
local function readComponent(a) return a.CharacterParameterComponent end
local function callGetParameter(c) return c:GetIndividualParameter() end
local function readParameter(c) return c.IndividualParameter end
local function readSave(p) return p.SaveParameter end
local function readSpecies(sp) return sp.CharacterID:ToString() end
local function readOwner(sp) return sp.OwnerPlayerUId end
local function readContainer(sp) return sp.SlotID.ContainerId.ID end
local function readLevel(sp) return sp.Level end
local function readGender(sp) return sp.Gender end
local function readHidden(a) return a.bHidden end
local function readLocation(a) return a:K2_GetActorLocation() end
local function readPassives(sp)
    local names = {}
    sp.PassiveSkillList:ForEach(function(_, e) names[#names + 1] = e:get():ToString() end)
    return names
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

function M.setup(c)
    ctx, get, alive = c, c.get, c.alive
    local ok, err = pcall(NotifyOnNewObject, CHARACTER, function(obj)
        -- Runs as the game creates the character: queue it and nothing more
        pending[#pending + 1] = obj
    end)
    if not ok then ctx.log("nearby pals unavailable: " .. tostring(err)) end
end

-- The character's data, once it has arrived (it can lag the character by a moment)
local function parameter(actor)
    local comp = get(readComponent, actor)
    if comp == nil then return nil end
    local p = get(callGetParameter, comp)
    if p == nil or not alive(p) then p = get(readParameter, comp) end
    if p == nil or not alive(p) then return nil end
    return p
end

-- Fills in what a character is; false while its data hasn't arrived
local function identify(e)
    local p = parameter(e.actor)
    local sp = p and get(readSave, p)
    if sp == nil then return false end
    local species = get(readSpecies, sp)
    if species == nil or species == "None" or species == "" then return false end
    local owner, container = guid(get(readOwner, sp)), guid(get(readContainer, sp))
    e.wild = (owner == nil or owner == NO_ID) and (container == nil or container == NO_ID)
    if not e.wild then return true end
    e.c = species
    e.lv = math.tointeger(get(readLevel, sp)) or 0
    e.g = math.tointeger(get(readGender, sp)) or 0
    e.l = false
    for _, name in ipairs(get(readPassives, sp) or {}) do
        -- The Lucky passive's game id
        if name == "Rare" then e.l = true end
    end
    return true
end

local function read(now)
    lastRead = now
    local queued = pending
    pending = {}
    for i = 1, #queued do
        local a = queued[i]
        if alive(a) then
            local key = get(readAddress, a)
            if key ~= nil and tracked[key] == nil then tracked[key] = { actor = a, since = now } end
        end
    end

    local parts = {}
    for key, e in pairs(tracked) do
        if not alive(e.actor) then
            tracked[key] = nil
        elseif e.wild == nil then
            if not identify(e) and (now - e.since) > LINK_FOR then tracked[key] = nil end
        end
        if tracked[key] ~= nil and e.wild and get(readHidden, e.actor) ~= true then
            local loc = get(readLocation, e.actor)
            if loc then
                parts[#parts + 1] = string.format('{"c":"%s","x":%.0f,"y":%.0f,"z":%.0f,"lv":%d,"g":%d%s}',
                    e.c:gsub('[^%w_]', ''), loc.X, loc.Y, loc.Z, e.lv, e.g, e.l and ',"l":true' or "")
            end
        end
    end
    local text = '{"v":1,"mod":"' .. ctx.version .. '","pals":[' .. table.concat(parts, ",") .. ']}'
    if text ~= lastText and ctx.writeFile("wild.json", text) then lastText = text end
end

-- A new world or character: the old characters are gone, so look again for the ones already loaded
function M.reset()
    pending, tracked = {}, {}
    seeded = false
end

-- Called on the game thread from the bridge's job
function M.tick(now)
    if ctx == nil then return end
    if not seeded then
        seeded = true
        local found = get(FindAllOf, "PalMonsterCharacter")
        if type(found) == "table" then for i = 1, #found do pending[#pending + 1] = found[i] end end
        return
    end
    if (now - lastRead) >= READ_EVERY then
        local ok, err = pcall(read, now)
        if not ok then ctx.log("nearby pals read failed: " .. tostring(err)) end
    end
end

return M
