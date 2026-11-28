# Crossbow-canyon-
It about towel defense

## Doodle Playground (index.html)

A 4-player free-for-all on a huge 130 m page of notebook paper, starring the Classic Doodle model. Fall off the edge of the page and you lose a life.

- Play vs 3 bots (easy, normal or hard), a practice range, or online: Quick match, private rooms with a 4-letter code, bots fill empty seats.
- Three lives each, sudden death at 2:10 (the ink ring closes in), time up at 4:00, last one standing wins.
- Online play uses the claude.ai page's `room` feature: the room's host runs the match and decides every hit; other players send their controls, predict their own doodle and see everyone else interpolated. If the host leaves, the next player takes over.

Source lives in `src/` (`core.js` rules, physics, bots; `gfx.js` 3D; `app.js` input, HUD, networking; `main.js` loop; `page.html` layout). Run `python3 tools/build.py` to rebuild `index.html`.
- The camera stays where you put it (drag, right-drag or Z/C to turn it). Following your doodle can be switched on in the pause menu.
- Lock-on: a rival who shoots you, or whom you hit, gets locked. Your shots aim at them, the camera keeps them in front of you and your doodle faces them. Q (or the lock button on phones) locks on or lets go.
