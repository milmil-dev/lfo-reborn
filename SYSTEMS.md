# LFO systems — clone checklist

Every system of the original client, with where its evidence lives and the remake's state.
Order of work: the systems first (this list, top to bottom), then the stories and missions.
Sources: `LFO.exe` (PACKET_* names, texture paths), `interface.pak` UI folders (`data/assets/ui/<folder>`),
`.spt` data (`.cache/lfo/**`), `data/lfo.db` (983 items, 21 categories), and the official system pages in
`legacy/content/docs/system/*.mdx`.

Legend: [x] done · [~] partial · [ ] not started · (server) needs other players; cloned against local/COM state

## Flow and account
- [x] Title, intro, PRESS ANY KEY, key config (`interface/controller`)
- [x] Server select (`server/`)
- [x] Profiles 01–03, create / delete (`profile/`, `profile.tzw`)
- [x] 選擇角色 (profile screen code decoded from LFO.exe)
- [x] Lobby: walkable map, chat panel, chara card, skill list, smileys
- [x] Profile select as the newer client (BOC ver.) draws it: red screen, a vertical carousel of every character the account has (no limit) plus an empty card for a new one, cards sliding 500 ms with the plugs pulled out and pushed back in (LFO.exe 0x587bcb), creation date under the name; ↑↓ / wheel / click to pick, Enter enter-or-create, Delete, Esc
- [x] Newer client's lobby HUD (BOC ver., 2025): status box laid out from the 720p game (photo at a quarter, bars at their size, name under, no numbers); chat panel folded to its right block (T / chatpanelmax unfolds it); the bottom dial + item strip in the lobby, its LFO plate opening the system menu; your name magenta under your feet
- [x] 小地圖 (`game/minimap.ts`): room outlines laid out by how their doors join, doors green, you white, others blue; the lobby only draws your room and its neighbours. Lobby and stages
- [~] Game menu (`interface/gamemenu1–10`): story / VS / mission / exit wired; others pending
- [x] Loading screens with slogans (`loading/`): the bigloading ring and a random slogan_a–e over black, as the play routes' pending UI and until the story / lobby has its room and player
- [x] 開設遊戲室 / new-game guide girl (`newgame/`): backg1 arena, the girl drawn as LFO.exe does (girl1 bottom-right, wink 1000–1499 ms, mouth flap 200–699 ms), room-name box (gamemenu3) with 確定 / 取消; comes between the stage select and the stage

## Combat core
- [x] Frame engine, specials (`spm`), effects (`bla`), hit / guard / fall / dizzy
- [x] Held 攻 / 跳 / 防, guard hold
- [x] Combo counter, GO!! arrow, HUD (`gameinterface/default`): status box and dial measured against the original client; 出招表 icons cast on click, its notch carries the client's closetablebutton
- [x] 更新內容 on the title screen: each release from CHANGELOG.md (release-please), a dot until the newest has been opened
- [x] Level / EXP / stat growth, LEVELUP pose (`PACKET_LEVELUP`): cap LV 150, LV 300 with the character's 異轉信物 (`tran.mdx`); a qualified character's STR / DEF / AGI cap rises to its 異轉 form's att max (`fanscamp/76.mdx`); endless spawners' monsters pay half EXP (`exp.mdx`). The EXP curve and points per level were server-side: the remake's
- [x] 體力 (SP): a pool sized by the SP stat; blocking a hit costs SP equal to its damage, without enough the guard breaks and with none 防 doesn't guard (client strings 「你現時的 SP 不足」, `fanscamp/24.mdx`); refills on its own. Running's SP drain (「跑步時SP下降率減半」) pending — its rate is unknown
- [x] 自由模式 (profile screen): new characters start at LV 150 and every 異轉 is open without its 信物
- [x] Items in the field: pick up / carry / throw / drink / heavy objects (`core/items.ts`, 164 field items from `bun stories.ts --items`)
- [x] Weapons: sword / long weapon swings and throws from the `wpn` weapon points, durability; bows fire on their own frames (aid 310's `bla` → arrow 1000 / 1100, flying for the holder's team); a raised shield (SHIELDUSE, held while 防 is) stops frontal hits, its durability taking the damage until it breaks. The `wea` weapon-skill row is 70 for every weapon of every character, so it changes nothing
- [x] Loot: stage `itm` tables roll on each KO (field items drop, the rest go to the backpack)
- [x] Save store: profiles, backpack, money, bank and 信物 in one Zustand store (`game/profiles.ts`, `lfo-reborn.save`; saves from before the rename carried over), old per-key saves carried over; screens read it live
- [x] Gamepad on every screen (`game/pad-bridge.ts`): d-pad / stick → arrows, ✕ Enter, ○ back, □ 攻, △ 異轉, Start menu, Select 出招表, L1 / R1 item / drop; in a fight the face buttons stay 攻 跳 防
- [~] Item bar: 10 slots from the backpack's field items (1–0 pick, ` fist, I take into hand, O drop; the held item follows through room changes); key items / doors (`PACKET_KEY*`, `OPENDOOR`) pending
- [x] Knock-down recovery: ↑ / ↓ on the floor rolls (LIEDOWNROLLU / D, B_ variants) and gets up; 跳 on the way down flips back (FALLRECOVERY)
- [x] Command input: 防-led commands keep the fighter's facing (防後前攻 types), and a typed prefix (防攻 of 防攻攻) holds the normal attack / jump; every special of every character is checked typed (`moves.test.ts`)
- [x] Stage music: each stage's .sty `bgm` is exported and played at the start (VS stages and towers have no script that plays any)
- [x] Street NPCs (`game/npcs.ts`): J near a tower guard or the status-reset NPC (its 「你沒需要重設基本能力。」), with a 「J 與…對話」 prompt
- [x] Scripts: a `background` to a room the map doesn't have (99 dummy.bg, cut rooms — 52 stages) is skipped instead of freezing the scene; a scene that ends faded out fades back in; a stage whose opening never adds player 1 gets the player
- [x] Defeated enemies lie a second, blink out, then leave (they stop counting at once)
- [x] Elements (`core/status.ts`): the hit box `effect` bits — 8 burn, 4 freeze, 16 shock, 1024 poison, 2048 confusion, 4096 stone (2 wind = knock-back) — with the effect sheet's FIRE / ICE / THUNDER / ROCK overlays and DIZZYRING, the status-box icons, and 咀咒 / 毒性 / 解毒藥水. Durations are the remake's (server-side in the client); the .spt `ele` resistances are 30 everywhere, so unused
- [x] 能力點 (`game/leveling.ts`): 3 points a level, spent with the chara table's up-arrows (+15 HP / MP / SP or +2 STR / DEF / AGI, up to the character's max), the AP box showing what is left; equipment checks its stat requirements (items.req, the client's 「你的 STR 不足以裝備這件物品。」); the 能力重設員 gives the points back from LV 10 for $500 × LV. Point values, the reset level and fee are the remake's (the server's are lost)
- [x] 角色資料 window on the client's chartable (photo, label sheet, values, AP box, medal); chara / skill / smiley / item windows float over the game with the HUD still up
- [~] 招式等級 (`core/skills.ts`): each use of a special is a point (saved per profile), LV 2–5 at 10 / 40 / 100 / 250, +6 % damage a level (its projectiles too), shown in the 出招表. The client kept skill EXP and the per-level effects on the server: thresholds and bonus are the remake's, per-level visuals not reproduced
- [~] 變身 / 異轉 transformation: 異轉能量計 (tranicon) in the status box fills on hits, Y / click transforms into the base id + 7000 form (its TRANSFORM burst, its own moves), drains 45 s, cancel once 30 % spent, ends on KO. Story needs LV 150 + the account's 信物 (`lfo.tokens`); the training ground always allows it. 信物 come from the card shop; the post-150 stat caps follow the form's att max
- [ ] Team skill / 合體 (`PACKET_TEAMSKILL`, `he-ti.mdx`, 念源體 items)
- [ ] Followers / 摩摩星 (`PACKET_CREATEFOLLOWER`, `mmsinterface/`, `momo.mdx`)

## Items and economy
- [x] Backpack + equipment box (`chest/equipbox`, slots decoded from LFO.exe; `game/inventory.ts`, `kit/equip-box.tsx`); storage chest (`chest/chestbox`) and item card pending
- [~] Equipment slots and stat effects: parts 0–8 worn, mods added to stats, held weapon starts the stage in hand; 時裝 / 背包 (avatar) pending
- [x] Shop (`shop/itembox`): item / weapon / armour shops sell from the client's SHOP/*.dat.tzw lists (`pipeline/shops.ts`), stock rolled per visit; selling pending
- [x] Character creation: 選擇角色 offers every playable character (81): profile.tzw's 22 first, then the ones that came later through packs and cards, with bars scaled from their base stats (`pipeline/profile.ts`). The head list wraps around endlessly. Names follow the client's rules (`game/names.ts`: 「角色名字不能含有附號」, 「角式名稱已被使用。」); 新建 only on an empty slot; delete asks 「你要刪除「…」嗎？」
- [x] Card shop 卡片店 (`itemcard/`): every card is listed — 855 item cards (whatever no shop sells, minus the beast swords) and 37 異轉信物 (`pipeline/relics.ts` → relics.json) — with search; picking one fills the 序號 / 密碼 box and 輸入 redeems it with the client's own lines (a 信物 once per account)
- [~] 儲物室 (`storageroom/store_rm`, on the profile screen): 人物 tab lists the account's character cards and takes one out (提取) into the selected empty slot under a new name — 「確定提取人物「…」嗎？」, 「…人物已存在，不能重複啟動。」, 「…人物啟動成功。」; 異轉信物 tab shows the relics held; 招式 / 道具 cards go straight into the game, so those tabs stay empty
- [x] Bank (`bank/bank_box` beside `chest/chestbox`): 50 slots per server shared by its profiles, click to deposit / withdraw, opens in the bank room
- [x] Ironsmith 維修 (`ironsmith/`): item + its own material (items' `material` → 2900 + n) + 修理費, the smith's own refusal lines; stage wear is written back to each carried copy (field hp ↔ durability). 強化 has no client data
- [x] Compose / 合成 (`compose/`): the 神秘人 in the repair shop sets one of the seven 魔精石 into the 魔劍 (兇獸突襲 notes); 魔劍 / 魔精石 cannot be banked
- [ ] Trade (`trade/`, `tradeui/`) (server)
- [x] Medals 勳銜: honor from VS (win 12, KO 3, loss −6; remake's numbers), eight ranks 嘍囉 … 尊者 at 0 / 30 / 100 / 250 / 500 / 900 / 1500 / 2500 with the client's promote / demote lines, medal01–08 on the profile card, beside the name in the status box (lobby, story, VS) and over the player's head in the lobby (LFO.exe 0x549017)

- [x] Lobby: the street rooms stitched into seamless strips (`story/stitch.ts`), doors with a push-in transition and preloading, original exit arrows

- [x] Stage events by the .sty files' own names: CHANGEPHASE (10) opens another room's phase (with TIMES), HALT (11) holds a room until it does, CH_DOOR (36) re-routes or locks a door while its phase lasts, RAN_DOOR (38) and doors with several targets lead anywhere they list, TELEPORT (31) / spawn (35) like WARP / SPAWN, GAMEOVER (23); `story/progress.test.ts` checks every story with an ending can reach it (the towers' random maze, special items and self-looping doors still to do)
- [ ] Remaining events: ADDKEY / REMOVEKEY (14/15), TIMESTAMP / TIMECHANGEPHASE (16/17), CANLEARN (18), ACTIVATECHAR (30), SP_ITEM (37), BLINKMINIBG (12); script commands giveitem, changesprite, showpicture / hidepicture, removeholder, credits

## Rooms and modes
- [~] 遊戲室 waiting room (`waitplayer/`, `/play/room`): you plus up to three COM rows (◀ ▶ character, ▲ ▼ LV, team badges 獨 / 1–4), LAUNCH?, room chat with the client's room lines. The online room list (`selectroom/`) has no offline counterpart
- [~] Stage select (`stage/`): all 122 story lines from LOADSTORYLIST (`stories/catalog.json`), searchable looping wheel; VS options, passwords pending
- [~] Result table (`gameresult/`): story done; VS table (`summarytablevs`) pending
- [x] VS mode with COM (`/play/vs`, `game/vs.ts`, `game/ai.ts`): the 14 VS stages exported with their names, 開設遊戲室 → waiting room → bout; last team standing (「最先打倒隊方所有成員」); COM players chase the nearest foe, type specials and guard, stronger with LV; result board with 再來一局 / 離開遊戲室. The other win rules (KO count, score, time) pending
- [x] 王者爭霸 / Champion (`champion/`, `game/champion.ts`, `/play/champion`): an eight-team knockout on the client's bracket (championbox, championteam heads, fightbubble, 互動電視 logo); you and a COM partner, your matches real 2-on-2 bouts on 王者爭霸台, the rest decided by strength; cup honor +60 (remake's). Reached from the 戰鬥 menu's 「LFO 皇者爭霸戰」
- [~] 死亡之塔: 人類之塔 / 魔族之塔 / 聖賢之塔 / 大雄寶殿 (tower01–03, tower_lantau; not in LOADSTORYLIST) exported and in the catalog; the street guards (撒龍巴司 room 6, the scythe-bearer room 8, 摩摩星村長 room 41) offer the climb on J (opening hours shown, not enforced); floor-by-floor rules still to be played through
- [x] 兇獸突襲 (`game/beasts.ts`): the seven beasts (Bestial_1–7: 狄加．奧比亞 … 卡索．卡凱尼) exported; one run in eight meets one at its second room (「謎之敵人在「…」出現了！」), its 魔精石 goes to whoever downs it (「…被…擊倒了！」). Odds are the remake's; KO → stone verified in the browser
- [x] 暗黑戰神: the dark characters (暗黑迪雲 / 星奇 / 米兒 / 菲雲 / 菲沙, 暗黑6–9號, ids 290–299 / 360–361) are in the roster with their own moves
- [ ] Rank board (`rank/`), info card with VS record (`info/`)
- [ ] Friends and private messages (`friend/`) (server)

## Content (after the systems)
- [~] Stories: all 122 lines exported (`stories.ts --all`) with the client's stage names (`sty` → stagename.tzw); played as the profile's own character; a character's own line only shows for that character. Per-line script quirks still to be played through
- [x] HD world: characters, effects, rooms, stages, portraits (Real-ESRGAN 2×, `pipeline/game-hd.ts`)
- [~] Missions: 59 / 60 exported and playable from the MISSION select (mission_school2hard has no .sty in the client); per-mission rules (timers, goals) still to be checked
