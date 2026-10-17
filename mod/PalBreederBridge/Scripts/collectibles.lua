-- Collected effigies and journals: which of them you've picked up, for the app's map.
--
-- Every effigy and journal in the world is loaded all the time (407 effigies and 64 journals),
-- each with a bPickedInClient flag that's true once you've collected it. They're found once per
-- world, then only their flags are re-read every few seconds (about a millisecond). The flags
-- arrive a few seconds after a world loads, so an early read showing none collected is normal; the
-- app only ever adds collected ones. Whenever more are collected, collected.json lists them all:
--   {"v":1,"mod":"1.10.0","world":"...","items":[{"c":"Relic_Penguin","x":-211180,"y":-80990},...]}

local M = {}

local READ_EVERY = 5.0
local FIND_EVERY = 10.0
local CLASSES = {
    "BP_LevelObject_Relic_C", "BP_LevelObject_Relic_FlameBambi_C", "BP_LevelObject_Relic_GuardianDog_C",
    "BP_LevelObject_Relic_IceCrocodile_C", "BP_LevelObject_Relic_LazyDragon_C", "BP_LevelObject_Relic_LeafMomonga_C",
    "BP_LevelObject_Relic_Monkey_C", "BP_LevelObject_Relic_Mutant_C", "BP_LevelObject_Relic_NegativeKoala_C",
    "BP_LevelObject_Relic_Penguin_C", "BP_LevelObject_Relic_PinkCat_C", "BP_LevelObject_Relic_SheepBall_C",
    "BP_LevelObject_Note_C",
}

local ctx, get, alive = nil, nil, nil
local objects = nil       -- { obj, c, x, y }
local lastFind = -1000.0
local lastRead = -1000.0
local written = -1        -- how many collected the last write listed

local function readLocation(a) return a:K2_GetActorLocation() end
local function readPicked(a) return a.bPickedInClient end

local function find(now)
    lastFind = now
    local list = {}
    for _, cls in ipairs(CLASSES) do
        local found = get(FindAllOf, cls)
        if type(found) == "table" then
            local short = cls:gsub("^BP_LevelObject_", ""):gsub("_C$", "")
            for _, o in ipairs(found) do
                local loc = alive(o) and get(readLocation, o)
                if loc then list[#list + 1] = { obj = o, c = short, x = loc.X, y = loc.Y } end
            end
        end
    end
    if #list > 0 then
        objects = list
        ctx.log(string.format("found %d effigies and journals", #list))
    end
end

local function read(world)
    local parts, anyAlive = {}, false
    for _, e in ipairs(objects) do
        if alive(e.obj) then
            anyAlive = true
            if get(readPicked, e.obj) == true then
                parts[#parts + 1] = string.format('{"c":"%s","x":%.0f,"y":%.0f}', e.c, e.x, e.y)
            end
        end
    end
    -- The world was left; find them again in the next one
    if not anyAlive then
        objects = nil
        return
    end
    if #parts > written then
        local worldPart = world and string.format(',"world":"%s"', (world:gsub('[%c"\\]', ''))) or ""
        local text = '{"v":1,"mod":"' .. ctx.version .. '"' .. worldPart .. ',"items":[' .. table.concat(parts, ",") .. ']}'
        if ctx.writeFile("collected.json", text) then written = #parts end
    end
end

function M.setup(c)
    ctx, get, alive = c, c.get, c.alive
end

-- A new world or character
function M.reset()
    objects = nil
    written = -1
    lastFind = -1000.0
end

-- Called on the game thread from the bridge's job; `world` is the save or server it belongs to
function M.tick(now, world)
    if ctx == nil then return end
    if objects == nil then
        if (now - lastFind) >= FIND_EVERY then pcall(find, now) end
        return
    end
    if (now - lastRead) >= READ_EVERY then
        lastRead = now
        local ok, err = pcall(read, world)
        if not ok then ctx.log("collected read failed: " .. tostring(err)) end
    end
end

return M
