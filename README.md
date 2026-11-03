# Crossbow Canyon

A 3D crowd tower-defense game for desktop and phone browsers. Huge swarms of rats scurry along a winding canyon road toward your town. You play the farmer: collect the gold they drop, stand on construction pads to build and upgrade crossbow towers, and survive all 16 waves on Easy, Normal or Hard. There are two maps: **Sunstone Canyon** and **Lonetree Hill**.

All characters, models, UI, the map, sounds and the name are original. The game is built from code: three.js geometry and WebAudio synthesis. It ships no image or audio files.

## Art style: outlined toon shading

Everything is drawn as an outlined 3D cartoon:
- **Toon shading:** every lit surface uses a three-band light ramp (lit, mid, shadow) instead of smooth shading. The key light comes from the upper left, so roofs and tops are bright, fronts sit in the mid band and right sides fall into shadow. Cast shadows are crisp, and units stand on hard-edged round shadows.
- **Ink outlines:** every model gets a dark ink line around its silhouette. This covers the farmer, every rat type, giant rats and all six bosses, every tower level and cannon barrel, the town hall, houses, walls, windmill, barn, villagers and crops, cliffs, rocks, cacti, coins, arrows, cannonballs and smoke puffs.
  - The lines keep the same width in screen pixels at any distance and on any screen density.
  - Outlines follow the GPU animation: they walk, flinch, lunge and roll over with the rats, and thin away when a defeated rat vanishes.
- **Ink lines on the ground:** the plateau lips, the foot of each cliff and both road edges carry drawn ink lines.
- **Cartoon UI:** HUD chips, buttons, cards, menus, banners and in-world labels share the same ink rim, a light top edge, a hard ink drop shadow and ink-outlined lettering. Build pads have an ink rim too.

The outlines use the inverted-hull method (`src/render/toon.js`):
- Each outlined mesh has a twin that draws only its back faces in ink, pushed outward along a smoothed normal by a fixed number of pixels.
- Smoothing the normals keeps the hull from tearing apart at the hard edges of the low-poly models.
- Instanced crowds share their instance data with their outline twin, so each rat type costs one extra draw call.
- The small rats use a cheaper outline hull, about half the triangles of the rat itself.

## A town worth protecting

The rats march on a living town in the north of the canyon.
- **The town hall** sits at the end of the road and is what the rats attack. It has a town clock and a belfry with a bell, and it grows with its upgrades: wooden hall, stone hall with a clock tower, then a grand hall with twin towers.
- **8 houses** ring the town square in four colour schemes. They grow with the town hall: straw-roofed wooden cottages, then plaster-and-timber houses with flower boxes, then two-storey town houses with gold trim. Chimneys smoke, and the windows light up warm yellow as night falls.
- **The square** has a well, a market stall with a striped awning and crates of produce, torches and footpaths out to the farms.
- **Two farms:**
  - The north-east farm has wheat with a scarecrow, cabbages, pumpkins, a farmhouse and a windmill whose sails turn.
  - The west farm has corn, wheat and cabbages beside a red barn with hay bales and a water trough.
  - Every field has rows of crops and a low wooden fence.
- **18 villagers** in three looks (farmers with straw hats and hoes, villager women in dresses and headscarves, townsmen in flat caps), each in their own clothes colour, two of them children. They all have ink outlines and are animated on the GPU.
  - **Everyday life:** farmers walk to a spot in their field and swing their hoes, townsfolk stroll between doors, the well and the market and say hello, pairs chat by the well and behind the market stall, and the kids run and hop round their playground.
  - **When rats approach:** within 16 units a villager stops, stares at the rats with a "!" bubble and heads home. Within 8.5 units, or anywhere near the town hall while it is being hit, they panic: arms flailing, "!!" or "Eek!", they sprint to their own front door and duck inside.
  - **Coming back out:** they stay hidden until every rat is well away or the wave ends, then step out one by one with a hop and a "Phew!" or "Safe!".
  - **Winning:** when you clear the last wave the camera swings to the town square, a "Victory!" banner goes up and everyone comes out to cheer. They jump with their arms in the air and shout "Hooray!", "Yay!" and "We did it!" under bursts of confetti, while the windmill spins faster. The victory card appears a few seconds later, and the party carries on behind it.
  - **Losing:** if the town hall falls, the townsfolk run and hide.
- **Sounds:** startled squeaks when villagers panic, a relieved whistle when they come out, and a cheering crowd with whistles and claps on a win.

The town is all decoration: villagers never change the battle. The farmer walks round the houses, barn, windmill, well and market stall, but can cross the fields and footpaths. The town hall plays exactly like the old keep: same health, upgrades and costs.

## Run it

**Quickest:** open `dist/index.html` in any modern browser. It is a single self-contained file (≈830 KB) and works offline. Without internet the display font falls back to a system font.

**From source** (Node 18+):

```bash
npm install
npm run build      # writes dist/index.html, dist/crossbow-canyon.html and dist/artifact/
npm run serve      # builds, then serves dist/ at http://localhost:8080
```

To test it on a phone, run `npm run serve` and open `http://<your-computer-ip>:8080` on a phone on the same Wi-Fi. You can also upload `dist/index.html` to any static host.

`dist/crossbow-canyon.html` is the same game without the outer `<html>` and `<head>` tags. It is meant for hosts that add their own page wrapper.

`dist/artifact/` holds a two-file version: a small `index.html` page plus `game.js`. It is for hosts that serve supporting files next to the page, and it is how the playable Claude artifact is published. `node tools/check-split.mjs` boots it in Chromium to confirm it works.

## Controls

| | Desktop | Phone / tablet |
|---|---|---|
| Move | WASD or arrow keys | Drag anywhere (floating joystick) |
| Start / skip to the next wave | Space / Enter, or **Skip wave** | **Skip wave** button |
| Auto skip on/off | `T`, or the **Auto** switch | **Auto** switch |
| Game speed 1× / 2× | `F`, or the **▶ 1×** button | **▶ 1×** button |
| Pause | Esc / P, or the pause button | Pause button |

The game pauses by itself when the tab is hidden or the phone locks.

If your device is set to reduce motion, the screen shake is cut to a faint tremor and the pulsing alerts (boss warning, red screen edges, villagers' alarm bubbles) hold still.

When `dist/index.html` is hosted on a website, a phone can add it to its home screen, and it then opens full-screen like an app.

## Two maps

Pick the map on the title screen (the scene behind the menu switches to it straight away). Both maps lead to the same town and use the same 16 waves, towers and bosses.

| | Level 1: Sunstone Canyon | Level 2: Lonetree Hill |
|---|---|---|
| The road | winds round two raised red-rock plateaus, from a burrow in the bottom-right corner | zig-zags back and forth in four long switchbacks, from a burrow in the bottom-left corner, up and over a big sand hill |
| Tower spots | mostly up on the plateaus | inside the hairpin bends and on the hillside, where one tower covers two stretches of road; one on a small mesa by the burrow |
| Rats | as listed below | 30% more health (the long switchback road gives towers more time) |

### Level 2: Lonetree Hill

The map is laid out like a footpath winding up a meadow hill, in desert colours:
- **The hill:** a smooth sand dome 5 units high in the middle of the canyon, paler and wind-rippled near the top, with its sunny side lit and its far side in shade. The road climbs it on two long switchbacks and comes back down the far side to the town.
- **On the summit:** a lone desert tree with a twisted trunk and a wide, flat canopy covered in white and yellow blossom, and a picnic in its shade: a striped, fringed blanket with a wicker basket, a straw hat, a jar of wildflowers and a book. A kite flies high above the hill on a string from the blanket, drifting and bobbing on the breeze.
- **Wildflowers** in yellow, orange, white, purple, red and blue grow in clumps all over the hill, clear of the road and the build spots.
- **Two red-rock mesas:** one beside the burrow carries a tower spot, the other stands on its own on the east side.
- **Everything follows the slope:** rats, giants and bosses walk up and down the hill, arrows aim at their height, cannonballs land on the slope, splats, puffs and blast rings sit on the ground, the road and build pads lie on the slope, and every tower spot on the hill sits on a small flat terrace dug into the slope, so towers stand level instead of half-buried on the uphill side.
- The farmer walks round the tree trunk.

**Balance on Level 2:** an efficient crossbow player wins Normal with 2–3 stars and a distracted player still wins. On Hard, crossbows alone fall on the final wave unless you repair the town hall between waves; cannon players win with 3 stars.

Saves remember their map: **Continue** and **Retry wave** reopen the game on the map it was played on, whatever is picked on the title screen, and the title shows each map's own best result.

## Difficulty

Pick **Easy**, **Normal** or **Hard** on the title screen before you press **New game**. The choice is remembered for next time.

| | Rat health | Diamonds for a full clear | Who it's for |
|---|---|---|---|
| **Easy** | 40% less (every rat, giant rat and boss) | 30 | a relaxed game; you still have to build and upgrade |
| **Normal** | as listed below | 50 | the game as designed |
| **Hard** | 20% more | 100 (double) | a real challenge: an efficient crossbow player scrapes through with 1–2 stars, cannons make it comfortable |

- A saved game keeps its own difficulty: **Continue**, **Retry wave**, **Restart level** and **Play again** all stay on it, whatever is picked on the title screen.
- The pause menu, the Continue button and the victory screen name the difficulty, and the title screen remembers the hardest one you have beaten.
- Saves from before difficulties existed carry on as Normal.

## Game speed

The **▶ 1×** button beside **Auto** (or `F`) switches between normal and double speed. At 2× the simulation simply takes twice as many fixed steps each frame, so a fast game plays out exactly like a normal one, only quicker. The setting is saved. Pausing still stops everything.

## Town hall repair

When rats damage the town hall, a green **✚ REPAIR** pad appears on the town hall pad (unless a town hall upgrade is waiting there, since an upgrade repairs it fully anyway).
- It costs **1 gold for each point of health lost**, rounded up to 5 (at least 10). The price rises as the hall takes more hits.
- Stand on it like any other pad: coins pour in, and when it is full the hall is back to full health with a green flash.
- The usual pad safeguards apply: stand still to pay, partial payments are kept, and gold poured into a repair that an upgrade makes unnecessary comes back.
- A hint points to it the first time it appears in a game.

Late in a game every tower is usually at level 7 and gold piles up with nothing to buy. Repairs give that gold a job: on Hard, a bot that repairs between waves wins with 2 stars where the same bot that never repairs gets 1.

## Tower attacks
- **Aiming:**
  - Every tower turns to face its target and only fires once it is lined up. Cannons turn more slowly than crossbows.
  - Crossbows tilt down at the rat they're tracking.
  - Cannon barrels sit on a trunnion and rise to the angle the cannonball will leave at, so higher lobs to farther groups show in the barrel.
- **Recoil:** every shot kicks the tower back on a spring. It springs forward past its resting point and settles, so you can feel each shot.
  - **Crossbows:** the head jerks back and up and squashes.
  - **Cannons:** the barrel slams back on its carriage, squashing and then stretching, with a comic muzzle burst. Thunder Mortar and Nova shots kick hardest, rockets least.
  - **The whole tower** thumps down a touch with each shot.
- **Crossbows target individual rats:**
  - They pick the front-most rat in range, the one closest to the town hall.
  - Each arrow is aimed at one rat, leading it if it's moving. Twin and triple crossbows give their side arrows to the next rats in line, or focus a giant rat with all of them.
  - Arrows fly in a straight line with a white streak (cyan at level 6, purple at level 7). The hit rat flinches.
- **Hits you can see:**
  - Where an arrow strikes a rat, an inked comic burst pops. A crowd takes hundreds of hits, so these are rationed to about 60 a second.
  - Shields take a wooden-coloured burst.
  - Arrows that hit a giant or boss show a burst on the side they came from, then **stay stuck in it**. They quiver as they land, ride along with it, then drop off after a couple of seconds, or as soon as it falls.
  - Cannon blasts get a big "pow" burst in their colour (orange, crystal blue or Nova purple), and Crystal Storm arrows and bounces get small purple bursts.
- **Cannons damage groups:**
  - They pick the densest group near the front of the crowd.
  - The cannonball flies in a visible arc with a smoke trail (crystal sparkles at levels 6 and 7) and a shadow on the ground.
  - A coloured ring on the ground shows where it will land and how wide the blast is.
  - The explosion hits every rat inside the ring.
  - Second barrels only pick another group the cannon is roughly facing, so every cannonball visibly leaves its barrel toward its target.

## Rat animations
- **Small rats** are animated on the graphics card, so hundreds of them still draw in one call. Each rat's legs, tail and head move around their own joints.
  - **Climbing out:** a new rat rises out of the burrow nose first, with a little dirt puff.
  - **Walking:** a trotting walk cycle, with diagonal legs together, a nodding head and a swishing tail. The cycle follows the distance actually walked, so feet don't slide, and slowed rats walk slower.
  - **Hit:** the rat flashes white, recoils with a squash, and its head jerks back and its tail whips.
  - **Attacking the town hall:** the rat rears up on its hind legs with its front paws raised, then lunges and bites. The bite lands on the exact frame the town hall loses health.
  - **Defeated:** the rat flashes, hops and flips onto its back, kicks its legs, then shrinks away in a white puff.
  - **Spent** (after its last swing at the gate): it spins and puffs away.
  - **Stunned or frozen:** it holds still, mid-stride. A rat dazed by a blast gets three little yellow **dizzy stars** circling its head.
  - **Thrown back by a blast:** the rat flies back along the road in a hop, and a big blast flips it head over heels. The simulation moves it at once; only the drawing catches up.
- **Giant rats and bosses** use moving limbs:
  - **Climbing out:** they rise out of the burrow.
  - **Walking:** a heavy stomp whose stride follows the distance walked.
  - **Hit:** a white flash, a lean back and a squash.
  - **Attacking the town hall:** they wind up the club overhead and smash it down in time with each hit on the gate, with a dust puff.
  - **Defeated:** a white burst, then they topple backwards, bounce with a dust ring and a screen shake, lie still, and sink away in a big puff. The HP number disappears the moment they're defeated. A Canyon Buzzard shot down drops out of the sky in a cloud of feathers.
- **Cartoon splashes:** every defeated monster leaves a little inked splat on the ground. The splat pops in with a bounce, lingers a few seconds and shrinks away.
  - Its colour depends on the kind: lavender for plain rats, pink for brood rats, green for healers and slimes, and so on, with each boss getting its own colour.
  - Droplets fly out of it, arc through the air and each leave a tiny splat where they land.
- **Coins:** they flip end over end as they fly, stretch as they fall, and squash flat on every bounce (harder bounces squash more). Hard landings kick up a puff of dust, coins on the ground glint now and then, and collecting one makes a twinkle by the farmer's hat.

## Characters
- **The farmer** (you): straw hat with a red band, red shirt, blue denim overalls and a pitchfork slung across the back.
- **Rats**: ten kinds of small rat, and each needs a different plan. They march one kind per row of the crowd, and healers walk in the middle of some rows.

| Rat | Look | Speed | Health | What it does | How to beat it |
|---|---|---|---|---|---|
| **Rat** | grey with pink ears and tail | normal | the wave's rat health | — | any tower |
| **Fast rat** | slim, sandy fur, red bandana, long ears and tail | 1.75× | 45% | runs ahead of the crowd; only 2 swings at the gate | towers near the burrow, the Rapid Launcher, Frost Arrows |
| **Armored rat** | dark fur, iron helmet with a crest, plated back, shoulder guards | 0.62× | 220% | blocks 35% of arrow damage, soaks up two arrows' worth of pierce, resists knockback, hits the gate for 2 | Armor Piercer (crossbow L4), the Thunder Mortar (2.3× vs armour) |
| **Shield rat** | brown fur, leather cap with a red feather, a big round wooden shield with an iron rim, red band and gold boss | 0.85× | 120% | its shield (2× its health) soaks up every arrow and stops piercing arrows dead; once it splinters it is drawn without the shield and fights on as an ordinary rat | cannon shells fly over the shield and Crystal Storm arrows fall from above; Armor Piercer arrows split shields 3× faster |
| **Healer rat** | pale fur, green hooded cape with a white cross, a staff with a glowing green orb | 0.9× | 140% | every 3 s heals the 5 most hurt rats within 3.6 units by 10% of their health (giants and bosses 0.4%), with a green ring and rising green plus signs; healed rats glow green | twin and triple crossbows (L3+) aim their extra arrows at healers; freezing or stunning it stops the heal; big blasts outpace it |
| **Brood rat** | fat, mottled purple-grey, a burlap sack on its back with three ratlings peeking out | 0.72× | 160% | when killed it bursts into 4 ratlings with a puff of burlap (not when it is spent at the gate) | area damage: cannon blasts, cluster bomblets, burning ground; kill it early on the road |
| **Ratling** | tiny pink-grey baby rat with big ears | 1.5× | 12% of its brood rat | tumbles out of the sack and runs on; bites the gate once | blasts and bouncing arrows |
| **Bomb rat** | sooty brown fur, a big round black bomb strapped on its back with a fizzing, sparking fuse, welding goggles pushed up on its forehead | 0.85× | 130% | shot down, it **blows up**: every rat within 1.5 takes 80% of the bomb rat's health in damage (enough for plain rats; a wounded bomb rat caught in it goes off too), giants and bosses a little. At the gate it blows a big hole in one go (6 damage) | pop it early, right in the middle of the crowd, and never let one reach the gate |
| **Ninja rat** | black fur, black hood and face mask with a white eye slit, red headband with trailing ties, a sword with a gold guard slung on its back, red sash | 1.35× | 90% | **dodges** one arrow every 1.3 s with a backflip in a puff of smoke; the arrow flies on | twin and triple crossbows fire more arrows than it can dodge; cannon blasts, burning ground and Crystal Storm rain can't be dodged; frozen or stunned it can't dodge |
| **Jetpack rat** | ginger fur, leather aviator cap with ear flaps and goggles, white flying scarf, a red twin-tank jetpack with yellow nose cones and little flames | 1× | 85% | every 4.5 s its **jetpack fires** for 0.9 s and it rockets forward at 3.2× speed, hopping on two jets of flame | Frost Arrows slow it even mid-boost; frozen or stunned it can't fire; strong towers near the end of the road |

  - Wave 1 is plain rats. Wave 2 adds fast rats, wave 3 armored rats, wave 4 shield rats, wave 6 healer rats, wave 7 brood rats, wave 9 bomb rats, wave 12 ninja rats and wave 14 jetpack rats.
  - The wave that introduces a kind always includes it, has its own title ("Shield rats raise their shields!") and shows a **New enemy** card for 7 s: a 3D portrait, what the rat does and how to beat it. On phones the card is smaller: it shows the rat's name and the main tip for beating it, and says **Tap for more**. Tapping it opens the full details (what the rat does and every tip) and keeps it up for 15 s; tapping again closes it. On a computer the card already shows everything, and clicking it closes it.
  - From the second half on, the rows are roughly 17% fast, 17% armored, 11% shield and 7% brood rats, plus 5–6% bomb rats from wave 9, 6–7% ninja rats from wave 12 and 7% jetpack rats from wave 14, and one row in ten has a healer.
  - The **Rat guide** (title screen and pause menu) lists every enemy, from plain rats to the six bosses: a 3D portrait rendered with the game's own toon shading, speed, health, armour, the wave it first appears in, what it does and how to beat it.
  - Cannons count armored rats as armoured, so the Thunder Mortar's bonus damage applies to them (and Rapid Launcher shells glance off them), and Frost Arrows slow fast rats down.
- **Villagers**: farmers, villager women, townsmen and two children. See "A town worth protecting" above.
- **Giant rats**: big upright rats with a nail-studded club, a red sash, one long pink tail that curls up at the tip, and a white HP number over their heads.
- **Bosses**: six bosses, on waves 5, 8, 10, 11, 13 and 15, all with a gold HP number and their own health bar. Bosses hit the gate harder and swing more times before they're spent. The first time each one comes in a game, a purple **Boss** card shows its portrait, what it does and how to beat it.
  - Three are giant rats with their own look and a cape:
    - **Rat Warlord** (wave 5): brown fur, orange eyes, a horned iron helmet, war paint, a spiked shoulder plate and a red cape. 1,000 HP and 30% armour.
    - **Iron Rat Baron** (wave 10): grey fur, ice-blue eyes, a steel chest plate and pauldrons, a visored great helm with a blue plume and a blue cape. The slowest boss, with 9,000 HP and 55% armour.
    - **Rat King** (wave 15): darker fur, red eyes, a gold crown and a purple cape. 14,000 HP and 40% armour.
  - Three have **special abilities**, and each needs its own plan (details below):
    - **Sewer Slime** (wave 8): splits into smaller slimes when it bursts.
    - **Tunnel Mole** (wave 11): digs under the canyon and bursts out near the town.
    - **Canyon Buzzard** (wave 13): flies over the road, out of reach of cannon shells, dropping rats.
  - All six return in the final wave 16.

## How a level plays

1. Rats climb out of a burrow, a dark hole ringed with dug-up earth in the bottom-right canyon gap, and pass a palisade gate. They march as a dense crowd up to 8 wide along the road, which winds around two raised plateaus.
2. Crossbow towers turn by themselves, lead their targets and fire visible arrows. Every level adds a new ability (table below).
3. Every defeated rat drops bouncing gold coins. Giant rats drop a whole shower. Walk within the faint ring around the farmer and the coins fly to you.
4. Pads on the ground show their price. Stand on one and coins pour in: the pad fills blue, the price counts down and coins fly from you into it. When it is full there is a gold flash and the crossbow pops up. The next pad then appears at a higher price (20 → 35 → 50 …).
5. Every crossbow has an upgrade pad beside it and can be upgraded from level 1 to level 7 at any time (table below). The only limit is gold. A pad by the town hall appears after wave 2 and upgrades it to stone (150 gold). A second pad after wave 5 upgrades it to the grand town hall (380). Each level adds health, refills it and upgrades the houses and walls. Whenever the hall is damaged and no upgrade is waiting, a repair pad takes that spot (see "Town hall repair" above).
6. Rats that reach the town hall swing at the gate a few times and then are spent. If its health reaches 0 you lose. Survive all 16 waves to win with 1–3 stars based on the town hall's remaining health.
7. The light shifts to sunset over the second half as the crowds grow.

### The 16 waves

Health numbers below are for Normal. Easy multiplies every one of them by 0.6 and Hard by 1.2.

| Waves | What comes |
|---|---|
| 1–4 | 45 → 160 rats with a few small giant rats (32–65 HP). One coin per rat. Wave 2 brings the first fast rats, wave 3 the first armored rats and wave 4 the first **shield rats**. |
| 5 | **Boss wave: the Rat Warlord!** 210 rats, three giants and the Warlord with 1,000 HP. Two coins per rat from here to wave 8. |
| 6–7 | 260 → 360 tougher rats and giants up to 360 HP. Wave 6 brings the first **healer rats** and wave 7 the first **brood rats**. |
| 8 | **Boss wave: the Sewer Slime!** 440 rats, four giants of up to 400 HP and the Sewer Slime with 700 HP (1,708 counting every piece it splits into). |
| 9 | Night falls, and **bomb rats** join the march. 460 rats with 48 HP each and four giants of up to 1,200 HP. |
| 10 | **Boss wave: the Iron Rat Baron!** 500 rats, four giants of up to 1,600 HP and the Baron with 9,000 HP. |
| 11 | **Boss wave: the Tunnel Mole!** 540 rats with 80 HP each, four giants of up to 2,000 HP and the Tunnel Mole with 4,500 HP. |
| 12 | **The Great Swarm, with ninja rats!** 700 rats at once with three 3,000 HP giants. |
| 13 | **Boss wave: the Canyon Buzzard!** 560 tougher rats (153 HP), four giants of up to 4,400 HP and the Canyon Buzzard with 8,000 HP. |
| 14 | **Giant rat stampede, with jetpack rats!** 520 rats with 247 HP and seven giants of up to 6,800 HP. |
| 15 | **Boss wave: the Rat King!** 640 rats with 350 HP, four giants of up to 9,800 HP and the Rat King with 14,000 HP. |
| 16 | **Final wave: every boss returns!** 760 rats with 362 HP, a 10,600 HP giant and all six bosses one after another: the Sewer Slime (3,000), the Warlord (5,000), the Canyon Buzzard (5,000), the Baron (5,500), the Tunnel Mole (5,000) and the Rat King (7,500). |

Every wave carries more total rat health than the one before. A test checks this. Waves 13–16 have 15% less rat health than before the shield, healer and brood rats arrived, because those rats make every wave tougher in their own ways. Waves 15 and 16 lost a little more when the final wave gained the three new bosses.

From wave 9 on, each rat drops one coin and giant rats' coin showers are capped. Gold stays tight enough that you choose which towers to push to level 7 first.

### Boss warnings

A boss never arrives unannounced:
1. **Between waves:** after the wave before a boss wave, a "Boss wave next!" banner and a siren name the boss. Until the wave starts, the line under the wave counter turns red and reads "⚠ Boss next" with the countdown.
2. **5 seconds before it climbs out:** a "⚠ Boss incoming!" banner names the boss and counts down. The screen edges pulse red, a siren sounds, red alarm rings pulse from the burrow, and a ☠ arrow at the screen edge points to the burrow if it is off-screen.
3. **When it appears:** the ground rumbles with a dust burst and a roar, a toast announces it, and a health bar with its name and HP appears under the wave counter. The ☠ arrow now follows the boss.

Bosses climb out partway through the crowd, so your towers are already busy with rats when they arrive. In the final wave all six bosses arrive one after another, each with its own warning and health bar.

### Bosses with special abilities

| Boss | Looks | What it does | How to beat it |
|---|---|---|---|
| **Sewer Slime** (wave 8) | a wobbly green goo blob with angry eyes, a toothy grin, a bone stuck in its side and a swallowed armored rat's helmet on top; it oozes along with a squash-and-stretch wobble | when it bursts it **splits into 2 slimes** (40% of its health each), and each of those into **2 slimelets** (40% again), each size smaller and faster than the last. Pieces are flung out of a green splat. A slime spent at the gate doesn't split. | burst it early, far from the town hall, so the pieces have a long way to go; cannon blasts and bouncing arrows hit the little slimes together; Frost Arrows freeze the small ones solid (the big one is only slowed, like every boss) |
| **Tunnel Mole** (wave 11) | a big velvety mole with a pink star nose, amber miner's goggles, a yellow hard hat with a lamp, a pickaxe on its back and two huge pink spade claws | after a short walk it **digs in** (claws churning, sinking nose first), then **tunnels** at 2.6× its speed where nothing can hit it: no tower aims at it and blasts pass over it. A hump of earth races along the road above it and the ground rumbles. It **bursts out near the town** (about 30 units from the gate) in a dirt eruption, with **8 rats** scrambling out of the tunnel behind it. | a red, cracked, pulsing circle marks where it will come up as soon as it digs, and an "Underground!" banner counts down to it; keep strong towers by the town hall and hit it hard before it digs in. Its health bar reads "underground" while it tunnels. |
| **Canyon Buzzard** (wave 13) | a huge bald-headed vulture with a pink head, white ruff, hooked yellow beak, broad feathered wings and a rope net full of rats hanging below | takes off from the burrow and **flies 5.4 units high** over the road, flapping and bobbing. **Cannon shells and every ground effect can't reach it** (blasts, burning ground, shockwaves, Crystal Storm rain). Every 4 s it **drops 4 rats** (30% fast rats) that tumble down and land in a puff. Near the town it stops dropping, glides down and **lands at the gate**, where cannons can hit it at last. | crossbows: arrows fly up at it, and every crossbow in range makes it its target, so twin and triple crossbows put every arrow into it. Leave the rats it drops to your cannons. A mix of crossbows and cannons handles it best. |

Arrows aimed up at the buzzard pass over the rats on the road, and arrows aimed at rats pass under it. The Sewer Slime's health bar counts the slime and every piece it will still split into, so it only ever goes down ("Sewer Slime ×4 · 448").

### Skip wave and Auto skip
- **Skip wave** (Space / Enter) sends the next wave at once.
  - Between waves it pays the early-call bonus: half the seconds left on the timer, in gold.
  - During a wave, the button shows a countdown ("in 7s") while rats are still pouring out of the burrow. Once every rat of the current wave is out, it unlocks. Skipping then sends the next wave right behind the current crowd, and immediately pays the current wave's clear bonus plus 10 gold.
  - The final wave can't be skipped.
  - Skipping stacks crowds, so it pays more but is riskier. A bot that skips every wave the moment it can loses around wave 10.
- **Auto** (switch under the wave card, or `T`) starts each wave 3 seconds after the previous one is cleared, instead of waiting out the 16-second build timer.
  - The wave card shows "Auto start in 3s".
  - Wave 1 never starts by itself, so you always get your first build phase.
  - The setting is saved and stays on for future games.

### Tower card
A small card in the bottom-left corner tells you about the tower or pad beside the farmer. It is kept small so it never hides the action:
- **Walking past a tower:** just a name tag with the tower's type, level and ability, and one line with the next upgrade and its price (or "Max level: every ability unlocked" at level 7).
- **Standing on a pad:** the upgrade details as well: the next level's ability and cost, the stat changes it brings (such as `Damage 8 → 11 · Pierce 1 → 2 · Range 11.5 → 12`) and a blue bar filling up as you pay (the cost reads `20/80` once you've started). On a computer it also has a one-line description of the new ability; on phones that line is left out.
- **On a build pad:** what you'll build (Level 1 crossbow or cannon) and its stats.
- **On the town hall pad:** the town hall's next level and its new health.
- While a tutorial hint is showing at the bottom of the screen, the card moves up out of its way.

The card follows exactly what you would buy, so you know what each level adds before you spend.

### Crossbow Tower: fast, precise attacks

Each level keeps the abilities of the levels before it.

| Level | Look | Ability | What it does in the game | Upgrade cost |
|---|---|---|---|---|
| 1 | Wooden drum, small crossbow | **Single Shot** | one arrow at one rat; the arrow stops in the first rat it hits | built for 20+ |
| 2 | Reinforced wood, bigger crossbow | **Power Shot** | fires about 40% faster and each arrow hits 60% harder | 30 |
| 3 | Stone base, twin crossbows | **Twin Shot** | two arrows per attack. Against small rats they go to the two front-most rats; against a giant rat both hit the giant | 50 |
| 4 | Heavy steel armour, arrow magazine | **Armor Piercer** | rapid heavy arrows ignore 60% of a giant rat's armour, and each arrow passes through up to two rats | 80 |
| 5 | Gold armour, triple crossbows | **Triple Barrage** | three arrows per attack, spread over up to three rats; every fifth attack is followed by a rapid burst of two extra volleys | 120 |
| 6 | Blue crystal, glowing cyan arrows | **Frost Arrows** | every hit slows a rat by 30%. Three hits on the same rat within 2.5 s freeze it in a block of ice (0.8 s, giant rats 0.55 s), then it can't be frozen again for 1.5 s. The Rat King is only slowed | 170 |
| 7 | Purple crystal, gold spikes | **Crystal Storm** | after an arrow's last hit it bounces to the nearest rat it hasn't hit, up to two times. Every 4.5 s the tower calls an arrow storm: 14 crystal arrows drop from the sky onto the densest group in range | 240 |

**Armour:** giant rats' armour blocks 30% of arrow damage, and the Rat King's blocks 40%. Cannon blasts ignore armour, except that light Rapid Launcher shells glance off it and Thunder Mortar shells hit it extra hard. While a Crystal Quake or Doomsday Nova has cracked a rat's armour, every tower hits it 50% harder.

The models follow the user's level 2–7 concept sheet. They are rebuilt as low-poly 3D, with glowing crystals and gems at levels 6 and 7.

### Cannon Tower (unlock with diamonds)

**Diamonds are earned wave by wave**, so a run where the town hall falls still pays for the waves you cleared. On Normal:

| Waves cleared | Diamonds per wave | Running total |
|---|---|---|
| 1–5 | 1 | 5 |
| 6–10 | 2 | 15 |
| 11–15 | 3 | 30 |
| 16 (the final wave) | 20 | **50** for a full clear |

Hard pays double every wave (**100** for a full clear). Easy pays half, rounded up (**30**).

- They are added the moment a wave is cleared and saved straight away. The "Wave cleared!" banner shows them, and the defeat and victory screens show the run's total.
- A wave pays only once per run. Continue and Retry wave remember which waves have already paid, so a lost wave pays when you retry and clear it, and earlier waves never pay twice.
- A skipped wave pays when the merged crowd is cleared.
- Restarting the level starts a new run.

In the **Armory** on the title screen, the Cannon Tower costs **100 diamonds**: two full clears on Normal, or one on Hard. The game asks you to confirm before spending them, and the Armory button glows gold once you can afford it. Diamonds and unlocks are saved in the browser.

Once the cannon is unlocked, a **Build** picker appears under the town hall's health bar in a game: tap the crossbow or cannon button, or press `1` / `2` (`Q` toggles). Empty build pads then show which tower they make and its price. A cannon costs about 25% more gold than a crossbow. Upgrade pads beside a cannon upgrade that cannon.

Cannons fire slower, arcing cannonballs that explode on impact and hit every rat in the blast. They pick the densest group near the front of the crowd and prefer giant rats. A direct hit deals 50% extra damage.

Levels 1–3 are the same for every cannon:

| Level | Ability | What it does in the game | Upgrade cost |
|---|---|---|---|
| 1 | Cannonball | explosive ball, damages rats close to the impact | built for 25+ |
| 2 | Heavy Blast | bigger, stronger explosion that pushes small rats back down the road | 35 |
| 3 | Double Cannon | two cannonballs in quick succession, the second looks for a different group | 60 |

#### The upgrade choice at level 4

When a cannon reaches level 3, **two upgrade pads** appear beside it instead of one: an orange **RAPID** pad with a rack of launch tubes and a blue **MORTAR** pad with a fat mortar. Step on the one you want.
- While you stand next to the cannon, the tower card shows both paths side by side with their price. On one of the pads it shows just that path, with its stats.
- The choice is for that cannon only, so you can build one of each.
- Once you pick, the other pad disappears. Any gold you had already poured into it comes back.
- From then on the cannon has one upgrade pad, which follows its path.
- The choice is saved with the game. Saves from before this update carry on as Thunder Mortars.

**Rapid Launcher**: fast, light shells that shred swarms and fast rats. Weak against armour.
- Every shell picks the best group again, so it spreads its fire across the crowd and catches fast rats.
- Light shells fly flat and fast, and their blasts are small but stay strong to the edge.
- Light shells glance off armour: armoured rats, giant rats and bosses take only 55% damage.

| Level | Ability | What it does | Upgrade cost |
|---|---|---|---|
| 4 | Rapid Launcher | four tubes fire in turn, a light shell every 0.34 s | 95 |
| 5 | Cluster Shells | every shell bursts into three bomblets that scatter over the crowd | 140 |
| 6 | Firestorm | fires every 0.3 s, and every shell leaves burning ground | 200 |
| 7 | Rocket Barrage | a rocket pod with red rocket noses; every 4 s a salvo of 14 rockets hits the front of the crowd | 280 |

**Thunder Mortar**: slow, enormous blasts that crush crowds, giants and bosses. Fast rats can slip past.
- High, slow-arcing shells with blasts of 3 units or more. Each blast stuns survivors and throws small rats back down the road.
- Double damage (2.3×) to armoured rats, giant rats and bosses.
- It fires only every 2.4–2.7 s, so early on single fast rats can slip between its shots.

| Level | Ability | What it does | Upgrade cost |
|---|---|---|---|
| 4 | Thunder Mortar | one enormous shell every 2.6 s | 95 |
| 5 | Triple Thunder | all three barrels fire together, spread along the road | 140 |
| 6 | Crystal Quake | twin crystal shells; each blast sends out a slowing shockwave and cracks armour for 4 s (cracked rats take 50% more damage from every tower) | 200 |
| 7 | Doomsday Nova | a huge armour-breaking Nova every 2.2 s, with side cannons firing in between | 280 |

**Which to pick:**
- Head to head, one tower against a parked Iron Rat Baron for 10 s, the Thunder Mortar deals about 1.4–2.4× the Rapid Launcher's damage.
- In a wave of nothing but fast rats against one level 4 cannon, far fewer rats slip past the Rapid Launcher than the Thunder Mortar.
- Full-level test players win all 16 waves with 3 stars on either path.

Each path has its own sound: a quick thunk from the launcher's tubes and a whoosh from its rockets, or a deep boom from the mortar that shakes the screen a little.

At the same level a cannon kills far more rats than a crossbow, on either path. Crossbows stay cheaper and react faster.

### Safeguards against accidental purchases
- Coins start flowing only after you stand still on a pad for 0.35 s, so walking across a pad buys nothing.
- After a purchase, any pad under you is disarmed. You must step off and back on to buy again, so standing still never buys the next level by accident. A "Step off, then back on to buy" label appears above you while you wait on a disarmed pad.
- Pads that appear near you right after a purchase are locked for 1.2 s.
- Partial payments are never lost. Walk away mid-fill and the pad keeps what you paid.
- If you run out of gold, the price turns red and a "Need N more gold" message appears.
- Restart level, New game over a saved run and Erase saved progress all ask for confirmation first.

## What came from the video, and what was designed

**Taken from the recording** (gameplay only, rebuilt with original art):
- Elevated, tilted perspective camera that follows the hero.
- Pale road winding around a raised plateau with a red cliff edge, ending at a keep surrounded by huts.
- Dense red crowds with large brutes mixed in, each brute showing a white HP number that counts down. Brutes flash white when hit.
- Auto-aiming crossbow towers firing white streaking bolts.
- White death puffs, ground marks where rats fall and bouncing coins (now cartoon splats and squashy, flipping coins).
- The hero vacuums up nearby coins.
- Price pads that fill blue as coins fly into them, then a gold build flash and the next pad at a higher price.
- A keep health bar that appears when the keep is attacked.
- A keep upgrade from wood to stone that also upgrades the buildings and towers.
- The shift toward dusk.

**Designed because the video doesn't show it:**
- HUD, wave counter and wave pacing, the 16-wave table, Skip wave and Auto skip, and the early-call bonus.
- Crossbow levels 2–7, designed from the user's concept sheet, and the crossbow abilities from the user's list. The numbers, armour and targeting rules are mine.
- Gate-swing damage rule, pad safeguards, victory/defeat and stars.
- Tutorial hints, the off-screen keep alert, save/continue, and all balance numbers.

## Saving
Progress is saved in the browser's local storage, and every access is guarded so private windows still play normally.
- **Checkpoint:** saved at the start of every wave, after every purchase between waves and every 5 s between waves. **Continue** on the title screen resumes from it.
- **Wave start:** used by **Retry wave** after a defeat. It restores the towers and gold you had when that wave began.
- **Settings and progress:** sound, music, graphics level, Auto skip, game speed, difficulty, the map last played, tutorial done, best wave, best stars and hardest difficulty beaten (overall and for each map), diamonds and unlocks.
- Checkpoints remember the game's map and difficulty and any gold already poured into a repair. A save only loads on its own map; saves from before Level 2 load on Level 1.

## Performance
- All small rats share one instanced draw call, as do their shadows, the coins, the bolts and each effect type. Static scenery is merged into a few meshes. The final wave puts nearly 600 rats on screen at once and renders in about 80 draw calls, ink outlines, the town and its 18 villagers included.
- Shadows are baked into a shadow map that only re-renders when a structure changes. Moving units use cheap blob shadows.
- The simulation runs at a fixed 60 Hz step with no per-frame allocations in hot loops. A step takes about 0.03 ms on a laptop CPU.
- The pixel ratio is capped by quality level. **Auto** quality picks High on desktop and Medium on phones, then drops a level if the frame rate stays under about 38 fps.

## Tests

```bash
npm test           # headless gameplay + balance tests (Node, ~10 s)
npx playwright install chromium   # first time only
npm run test:e2e   # real-browser tests on desktop, phone portrait and landscape
ONLY="skip|auto" npm run test:e2e   # run just the matching browser tests
CHROMIUM_PATH=/path/to/chrome npm run test:e2e   # use a Chromium you already have
```

**Headless gameplay tests** (77) check:
- The maps (each check runs on both): the road never cuts through a plateau, every tower slot can reach the road, the town stays clear of the road, and upgrade-choice pads fit beside their towers.
- Level 2's hill: the road climbs it and the summit rises above the road; the tree and the picnic sit on the summit, clear of the road, the towers and their pads; the town stays on flat ground; towers never float over the slope, and every tower spot is flat out to 2 units; rats walk on the slope, arrows strike at their height and cannonballs land on the slope. A save remembers its map and never loads on another one.
- Aiming: crossbows and cannons turn round to face the rats before they shoot, and never fire more than about 25° off their target. Arrows close in on the one rat they were fired at. Cannonballs rise above the barrel, land on their aim point and catch groups.
- Rat types: each kind shows up first in its own wave (fast 2, armored 3, shield 4, healer 6, brood 7, bomb 9, ninja 12, jetpack 14) with the right speed and health.
- The newest rats: a bomb rat shot down knocks out the rats next to it but not those out of reach, gives giants a smaller hit, sets off a wounded bomb rat beside it, and at the gate blows its 6-damage hole without going off on the crowd. A ninja rat dodges an arrow, is hit by the next one straight after, dodges again after a moment, can't dodge a blast, and can't dodge while stunned. A jetpack rat fires every 4.5 s, each boost carries it the right extra distance, and a stunned one neither moves nor fires. Ratlings only come out of brood rats. Armour blocks arrow damage, Armor Piercer gets through it, and the cannon bonus applies.
- Enemies that need tactics:
  - Shield rats: the shield soaks up an arrow and stops it, so a piercing arrow never reaches the rat behind. Armor Piercer splits shields 3× faster. A breaking shield passes the rest of the damage on. Cannon blasts and Crystal Storm arrows hit the rat itself.
  - Healer rats: they heal the 5 most hurt rats in reach by the right share, nothing out of reach, then wait out the cooldown. A stunned or frozen healer does nothing, and giants get only a sliver.
  - Twin crossbows send their extra arrow at a healer.
  - Brood rats: four ratlings with the right health and speed, counted in the wave. A brood rat spent at the gate never bursts, and a wave only clears once its ratlings are gone.
  - The right tactic works: cannons lose almost nothing to shields and kill more of a shield-and-brood wave than crossbows of the same level.
- The Rat guide covers every rat type, the giant rat and every boss, each with a name, trait, counter and the wave it first appears in.
- Bosses with special abilities:
  - Sewer Slime: it bursts into two slimes with 40% of its health, each of those into two slimelets, every size smaller and faster, all counted in the wave. Frost freezes the small slimes but only slows the big one, and a slime spent at the gate doesn't split.
  - Tunnel Mole: it digs in, warns where it will come up, can't be targeted or blasted while it tunnels, comes up at the exit near the town about when the warning said, brings 8 rats, and can be hit again once out.
  - Canyon Buzzard: it cruises 5.4 high where cannons find nothing to shoot and blasts can't reach it, crossbows target it first and hit it in the air (their arrows pass over the rats below), it drops 4 rats every 4 s that fall from its height, and it lands at the gate where cannons can hit it.
- Combat: rat crowds climb out of the burrow and walk the road, bolts kill rats, coins drop and are collected. Hits start the flinch timer, and defeats report which way the rat faced.
- The tower card: all 14 abilities have names and descriptions, and every level changes the tower's stats. It shows the right tower, ability and next-upgrade cost and gains, the build-pad info and "max level" at 7, and hides away from towers.
- Building: one tower per purchase, the step-off safeguard, partial payments, the town hall upgrade, one crossbow upgraded all the way from 1 to 7, and every tower level firing its arrows.
- Each crossbow ability:
  - Single Shot hits one rat, and Power Shot is faster and stronger.
  - Twin Shot splits its arrows between two rats or focuses a giant.
  - Armor Piercer gets through armour and passes through two rats.
  - Triple Barrage bursts on every fifth attack.
  - Frost Arrows freeze after three hits, frozen rats stand still, and bosses are only slowed.
  - Crystal Storm arrows bounce, and storms fall on schedule.
- Defeat, save/load round trips and determinism.
- Difficulty: Easy and Hard scale the health of every rat, giant, boss and tunnel rat but never change which rats come; diamonds come to 30 / 50 / 100 for a full clear and never pay less on a later wave; saves keep the difficulty and older saves play on Normal.
- The repair pad: it appears once the hall is hurt, is priced at the health lost and rises with more damage, restores full health, never sits beside a town hall upgrade, refunds gold an upgrade made unnecessary, and survives a reload.
- The 16 waves: every wave is harder than the one before, the bosses come on waves 5, 8, 10, 11, 13 and 15 with a "Boss wave" title (the three rat bosses each tougher than the last), and all six return in wave 16.
- Boss warnings: the HUD knows a boss is next during the build phase, the warning fires 5 s before the boss climbs out, and each boss gets its own name, armour and speed.
- The town:
  - Houses, fields, the windmill, barn, well and market stay clear of the road, the tower slots, the town hall pad and the plateaus, and they don't overlap each other.
  - Every villager has a front door and a field or spot to go to, and chatters come in pairs.
  - Villagers are calm with no rats about, become alert when rats come near, and panic close up or near the town hall while it is hit (far-off farmers stay calm).
  - They stay hidden while rats are about, come out when it is safe, cheer a win and hide when the town falls.
- Skip wave: between waves it gives the early bonus. Mid-wave it stays locked until the wave is out, then pays the bonus and merges the next wave into the crowd. The final wave can't be skipped.
- Auto skip: the next wave starts 3 s after a clear, versus 16 s without it, and wave 1 never starts by itself.
- Diamonds: the wave payouts add up to 50, a run that clears three waves earns the first three payouts, reloading a checkpoint never pays a wave twice, a short run still earns its waves' diamonds and a full clear earns exactly 50.
- Balance: an idle player loses by wave 2 and a player who never upgrades loses at wave 7. A distracted player wins, an efficient crossbow-only player wins all 16 waves with 3 stars (2–3 with Auto skip on), and cannon players win with 3 stars on either path.
  - Hard: the efficient player still wins (with less town hall health left than on Normal), a distracted player loses, and cannons win with 3 stars. Repairing between waves earns the efficient player more stars.
  - Easy: a distracted player wins with 3 stars, but an idle player and one who never upgrades still lose.
  - Level 2: an efficient player wins with 2–3 stars, a distracted one still wins, idling or never upgrading loses. On Hard, cannons win with 3 stars and crossbows alone only hold with repairs. The cannon player still builds every third tower as a crossbow, because only crossbows can shoot down the Canyon Buzzard while it flies.
- The Cannon Tower:
  - It is locked until unlocked and has priced pads.
  - Levels 1–3 each work as described.
  - The upgrade choice: two pads at level 3, the one you stand on sets the path, the other pad's gold comes back, and only that path's pad follows.
  - Every choice pad sits on its tower's ground, clear of the road, other pads and the town.
  - The Rapid Launcher fires several times as often, lets fewer fast rats through, and has cluster bomblets, burning ground and rocket salvos.
  - The Thunder Mortar has huge stunning blasts, three shells at once, a shockwave that cracks armour, and the Nova.
  - The Thunder Mortar hurts a boss far more than the Rapid Launcher.
  - Both paths beat crossbows of the same level.
  - The path is saved and restored, and old saves become Thunder Mortars.
  - Cannon players (two cannons for every crossbow) win with 3 stars on either path.
- Simulation speed.

**Browser tests** (34) check:
- The newest rats: wave 9 shows the New enemy card for bomb rats with its 3D portrait; in the final wave bomb, ninja and jetpack rats are all drawn with their own models, a bomb rat going off draws a blast, and jetpacks fire.
- Level 2: picking it on the title screen switches the scene (and back again), a new game starts on it, rats are drawn standing on the hill, a saved Level 2 game says so on the Continue button and reopens on Level 2 even with Level 1 picked, and the map is remembered after a reload.
- Every button: title, how to play, settings toggles, quality, pause/resume, Escape, tab-hide pause, start wave, restart confirmation, main menu, defeat retry, victory play again, and continue after reload.
- Skip wave: early start, locked with a countdown while rats pour in, a mid-wave skip with the bonus shown on the button, and Space.
- Auto skip: the switch and the `T` key, the "Auto start" countdown, wave 2 starting within 3 s, and the setting surviving a reload.
- Game speed: the 2× button really runs the game about twice as fast, `F` switches back, the choice is saved, and pausing still stops the game.
- Difficulty: Normal is picked by default, picking Hard is saved and shows its payout, a Hard game has tougher rats and says "Hard" in the pause menu, and Continue and Restart keep the saved game's difficulty.
- The repair pad: it appears beside a damaged town hall with a hint, the tower card says "Repair the town hall", and walking onto it restores full health for the right gold.
- Keyboard movement.
- The touch joystick, driven with real touch events.
- HUD fit on a phone screen, including the Skip and Auto buttons.
- Rotating between landscape and portrait.
- Walking one crossbow up from level 1 to level 7 with the keyboard, without ever upgrading the town hall. Each new ability is announced, and the tower card shows the new level, previews the next one and says "max level" at 7. It is the full card on a pad and the small name tag beside the tower.
- Frozen rats drawn in ice and Crystal Storm arrows falling, in the real renderer.
- Tower attacks drawn in the browser: tower heads match the aim, crossbows tilt down at their rat, cannon barrels rise for the shot, and every cannonball in the air has a landing ring.
- Rat animations: all three rat types are drawn with their own models, each rat gets its own walk phase, no rat appears before the burrow, rats at the gate carry an attack phase, defeated rats keep animating and are then removed, and a defeated giant rat falls over before it disappears.
- All seven tower levels rendering.
- The Armory: unlock disabled without diamonds, confirmation before spending 100, purchase saved.
- Picking the cannon, building it by walking onto a pad, and upgrading it to level 3. Two choice pads then appear, and the tower card offers both paths. It goes on to a level 7 Rapid Launcher, a second cannon becomes a level 7 Thunder Mortar, and together they fight a wave with rocket salvos and Novas.
- Diamonds: paid wave by wave (2 after two waves), shown on the defeat screen when the town hall falls on wave 3, not paid twice after Retry wave, and 50 in total after clearing the level.
- Boss waves: the red "Boss next" notice before wave 5, the "Boss incoming!" banner, red vignette, burrow alarm and ☠ edge arrow 4–5 s before the Rat Warlord climbs out, the appearance toast, the Warlord's own model, and its health bar, which goes away once it is defeated.
- The cartoon look:
  - No smooth-shaded materials are left.
  - The rats, farmer, town hall, terrain, giant rats and towers all have ink outlines, and the rat outlines stay in step with the crowd.
  - A rendered frame shows thousands more ink-dark pixels with outlines on than with them off.
- The town in the real game:
  - It has villagers, outlined houses and the windmill, and the farmers work while neighbours chat.
  - Rats in the square make villagers panic, show alarmed speech bubbles and hide indoors, and everyone comes back out once the wave is over.
  - A win swings the camera to the square, most villagers cheer, and the victory card follows.
- Enemies that need tactics, in the browser:
  - Wave 4 shows the New enemy card for shield rats, with a 3D portrait and the cannon tip, and its × closes it. The bomb rat card closes when you click anywhere on it.
  - On a phone the shield rat card says "Tap for more" and leaves out what the rat does; the first tap opens the full details, the second closes it.
  - In wave 7 a shield breaks, a brood rat bursts into ratlings and a healer heals. All eight rat models draw (including the shield rat without its shield), and green plus signs rise.
  - The Rat guide opens from the pause menu and the title screen. Every entry, all six bosses included, gets a real (not blank) 3D portrait, and Back returns to where you came from.
- Bosses with special abilities, in the browser:
  - Wave 8's Sewer Slime gets the purple Boss card, its own model and a health bar. It splits into two smaller drawn slimes ("Sewer Slime ×2"), then four ("×4").
  - The Tunnel Mole digs in with an "Underground!" banner. It disappears, the hump of earth and the red cracks show, and its bar reads "underground". It then comes up visible, with a toast and its rats, and the hump and cracks go away.
  - The Canyon Buzzard is drawn more than 4 units up, drops rats, and is drawn on the ground once it lands at the gate.
- Satisfying effects, with frames stepped by hand so the checks are exact:
  - A shot kicks a tower back (head moved back), it springs past rest and settles.
  - Impact bursts appear for arrow hits.
  - An arrow sticks in a giant, is drawn, and drops off when the giant falls.
  - Defeats leave splats and droplets.
  - A rat thrown back is drawn sliding back and lands where the simulation put it.
  - Stunned rats get dizzy stars, and a coin just after a bounce is drawn squashed.
- A full autoplayed 16-wave level that ends on the victory screen.
- A frame-cost check with the biggest crowd on screen.

`tools/balance.mjs` prints a per-wave report for the bot players, for example `node tools/balance.mjs bot+auto`, `node tools/balance.mjs bot+skip`, `node tools/balance.mjs bot+hard+repair` or `node tools/balance.mjs bot+l2` (Level 2). `tools/scene.mjs` takes scripted screenshots.

## Project layout

```
src/config.js        every balance number: waves, towers, costs, and both maps (MAPS)
src/world.js         road path (arc-length), plateaus, hills, terrain height, RNG, setLevel()
src/sim.js           deterministic game simulation (runs in Node and browser)
src/bot.js           autoplayer used by tests and the title-screen demo
src/main.js          game shell: loop, screens, HUD, saving, tutorial
src/towerinfo.js     tower card text: abilities, stats and next-upgrade preview
src/ratguide.js      Rat guide entries: every enemy's trait, how to beat it, first wave
src/render/portraits.js  3D enemy portraits for the Rat guide and New enemy card
src/input.js         keyboard + floating touch/mouse joystick
src/audio.js         synthesized SFX and music (WebAudio)
src/save.js          guarded localStorage
src/render/*.js      three.js view, procedural models, environment, effects
src/render/ratanim.js  GPU walk / hit / attack / defeat animation for the small rats
src/render/toon.js   toon shading ramp and screen-space ink outlines
src/town.js          town layout helpers, villager roster and how villagers react to rats
src/render/town.js   villager behaviour, speech bubbles and celebrations
src/render/villageranim.js  GPU walk / work / panic / cheer animation for the villagers
src/index.template.html   HUD/menu markup and styles
build.mjs            esbuild bundle → single-file HTML
tests/               headless and browser test suites
docs/screenshots/    captures from the test runs
```

Balance lives in `src/config.js`. For example, add a wave to `waves`, or change `buildCosts`, `towers` or `fortressLevels`. Then run `npm test` to confirm the level is still winnable and still loses when you don't upgrade.

Third-party code: three.js r169 (MIT), bundled into the build.
