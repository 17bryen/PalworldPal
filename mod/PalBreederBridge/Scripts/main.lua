-- PalBreeder Bridge: tells the PalBreeder app where you are and what you've caught.
--
-- Client-side only. It reads the local player's position, facing and Paldeck capture counts and
-- writes them as small JSON files to %APPDATA%\palbreeder\bridge\, which the app reads. It changes
-- nothing in the game and sends nothing over the network, so it works on servers without the mod.
--
-- THREADING. UE4SS's Lua state is shared and unlocked between its timer thread and the game
-- thread. Following PalMiniMap's hard-won rules (github.com/jeankassio/PalMiniMap):
--   * ONE LoopAsync timer, and at most ONE ExecuteInGameThread dispatch outstanding;
--   * a short gap after a game-thread job ENDS before the next dispatch is taken;
--   * the timer-thread predicate is pure arithmetic and allocates nothing;
--   * every UObject read happens on the game thread, inside pcall.

local VERSION = "1.1.0"
local TICK_MS = 33            -- timer resolution, not the write rate
local POSITION_EVERY = 0.1    -- seconds between position writes
local CAPTURES_EVERY = 3.0    -- seconds between capture-count reads
local DISPATCH_GAP = 0.033    -- seconds after a job ends before the next dispatch
local DISPATCH_TIMEOUT = 3.0  -- a dispatch this old was dropped (world transition); try again

local function log(msg)
    print("[PalBreederBridge] " .. tostring(msg) .. "\n")
end

-- Output folder. The app creates it; if it doesn't exist yet, writes fail quietly until it does.
local appData = os.getenv("APPDATA")
local outDir = appData and (appData .. "\\palbreeder\\bridge\\") or nil
if outDir == nil then
    log("APPDATA is not set; nothing will be written")
end

-- Write via a temp file so the app never reads half a file. Windows rename won't replace an
-- existing file, so the old one is removed first; the app tolerates the brief gap.
local function writeFile(name, text)
    if outDir == nil then return false end
    local path = outDir .. name
    local tmp = path .. ".tmp"
    local f = io.open(tmp, "w")
    if f == nil then return false end
    f:write(text)
    f:close()
    os.remove(path)
    return os.rename(tmp, path) ~= nil
end

-- Reflection helpers. Arguments are passed rather than closed over so the hot path doesn't
-- allocate a closure per call.
local function get(fn, ...)
    local ok, v = pcall(fn, ...)
    if ok then return v end
    return nil
end

local function callIsValid(o) return o:IsValid() end
local function alive(obj)
    if obj == nil then return false end
    local ok, valid = pcall(callIsValid, obj)
    return ok and valid == true
end

local function rawIsLocal(pc) return pc:IsLocalPlayerController() end
local function rawPawn(pc) return pc.Pawn end
local function rawLocation(pawn) return pawn:K2_GetActorLocation() end
local function rawYaw(pc) return pc:GetControlRotation().Yaw end
-- Palworld shows the mouse cursor whenever a menu, inventory, chest or the map is open
local function rawCursor(pc) return pc.bShowMouseCursor end
local function rawPlayerState(pc) return pc.PlayerState end
local function rawRecordData(ps) return ps.RecordData end
local function rawCaptureItems(rd) return rd.PalCaptureCount.Items end

-- The local player's controller, found once and kept until it dies. The pawn is read fresh
-- each time because it changes on respawn.
local cachedPC = nil
local pcRetryAt = 0.0
local function playerController()
    if alive(cachedPC) then return cachedPC end
    cachedPC = nil
    local now = os.clock()
    if now < pcRetryAt then return nil end
    pcRetryAt = now + 1.0
    local found = get(FindAllOf, "PlayerController")
    if type(found) ~= "table" then return nil end
    local fallback = nil
    for i = 1, #found do
        local pc = found[i]
        if alive(pc) then
            if get(rawIsLocal, pc) == true then
                cachedPC = pc
                return pc
            end
            fallback = fallback or pc
        end
    end
    cachedPC = fallback
    return fallback
end

local seq = 0
local function writePosition(pc)
    local pawn = get(rawPawn, pc)
    if not alive(pawn) then return end
    local loc = get(rawLocation, pawn)
    if loc == nil then return end
    local yaw = get(rawYaw, pc) or 0
    local ui = get(rawCursor, pc) == true
    seq = seq + 1
    writeFile("live.json", string.format(
        '{"v":1,"mod":"%s","seq":%d,"x":%.1f,"y":%.1f,"z":%.1f,"yaw":%.1f,"ui":%s}',
        VERSION, seq, loc.X, loc.Y, loc.Z, yaw, ui and "true" or "false"))
end

-- Capture counts live on the player state's record data as an array of { Key = pal id,
-- Value = count }. Only written when something changed.
local lastCaptures = nil
local function readCaptureItem(elem)
    local item = elem:get()
    return item.Key:ToString(), item.Value
end
local function writeCaptures(pc)
    local ps = get(rawPlayerState, pc)
    if not alive(ps) then return end
    local rd = get(rawRecordData, ps)
    if not alive(rd) then return end
    local items = get(rawCaptureItems, rd)
    if items == nil then return end
    local parts = {}
    local ok = pcall(function()
        items:ForEach(function(_, elem)
            local okItem, key, value = pcall(readCaptureItem, elem)
            if okItem and key ~= nil and value ~= nil then
                parts[#parts + 1] = string.format('"%s":%d', key, value)
            end
        end)
    end)
    if not ok then return end
    table.sort(parts)
    local text = '{"v":1,"mod":"' .. VERSION .. '","counts":{' .. table.concat(parts, ",") .. '}}'
    if text ~= lastCaptures then
        if writeFile("captures.json", text) then lastCaptures = text end
    end
end

-- Scheduling state, touched by both threads. Plain numbers and booleans only.
local inFlight = false
local sentAt = 0.0
local endedAt = 0.0
local lastPosition = 0.0
local lastCaptureRead = -1000.0

-- Runs on the TIMER thread. Pure arithmetic; returning true claims the dispatch.
local function due()
    local now = os.clock()
    if inFlight then
        if (now - sentAt) < DISPATCH_TIMEOUT then return false end
        inFlight = false
    end
    if (now - endedAt) < DISPATCH_GAP then return false end
    if (now - lastPosition) < POSITION_EVERY then return false end
    inFlight, sentAt = true, now
    return true
end

-- Runs on the GAME thread.
local function job()
    local now = os.clock()
    lastPosition = now
    local pc = playerController()
    if pc ~= nil then
        pcall(writePosition, pc)
        if (now - lastCaptureRead) >= CAPTURES_EVERY then
            lastCaptureRead = now
            pcall(writeCaptures, pc)
        end
    end
    -- Release the timer thread last; the gap keeps the next dispatch clear of this one's cleanup
    endedAt = os.clock()
    inFlight = false
end

local function safeJob()
    local ok, err = pcall(job)
    if not ok then
        endedAt = os.clock()
        inFlight = false
        log("job failed: " .. tostring(err))
    end
end

LoopAsync(TICK_MS, function()
    if due() then
        local ok, err = pcall(ExecuteInGameThread, safeJob)
        if not ok then
            inFlight = false
            log("dispatch failed: " .. tostring(err))
        end
    end
    return false -- keep the timer running
end)

log("loaded v" .. VERSION .. (outDir and (", writing to " .. outDir) or ""))
