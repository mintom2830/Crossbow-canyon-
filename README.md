# Crossbow-canyon-
It about towel defense

## Doodle Playground (index.html)

A 4-player free-for-all on Doodle Island, starring the Classic Doodle model.

- Play vs 3 bots (easy, normal or hard), a practice range, or online: Quick match, private rooms with a 4-letter code, bots fill empty seats.
- Three lives each, sudden death at 2:00 (the ink ring closes in), last one standing wins.
- Online play uses the claude.ai page's `room` feature: the room's host runs the match and decides every hit; other players send their controls, predict their own doodle and see everyone else interpolated. If the host leaves, the next player takes over.

Source lives in `src/` (`core.js` rules, physics, bots; `gfx.js` 3D; `app.js` input, HUD, networking; `main.js` loop; `page.html` layout). Run `python3 tools/build.py` to rebuild `index.html`.
