# Task card: M-0187 — paint a conifer bough atlas with image_generation

Work in this worktree (branch `maestro/M-0187-conifer`). Follow AGENTS.md. Do not commit, merge or push. Only create files under `art/painted-gen/conifer_m0187/`.

## What to make
A 1024x1024 hand-painted texture: four conifer boughs in a 2x2 grid, used as alpha-keyed cards on a stylized game tree (top-down MMO camera, look: Ragnarok Online 3 / Genshin-like hand-painted foliage).

Use the image_generation tool with `art/painted-gen/conifer_m0187/guide.png` as the layout input image.

Requirements for the image:
- Same 2x2 layout as the guide: each bough's root at the bottom centre of its own 512x512 cell, the bough growing straight up, tip near the top of the cell. Keep each bough's overall silhouette size and position close to the guide (it may be a little fuller). Boughs must not touch each other or the cell borders (leave >= 12 px of background around each).
- Background: one flat solid colour exactly like the guide's deep green (RGB 22,50,32). No gradients, no grid lines, no text, no shadows on the background.
- Each bough: a drooping fir/spruce spray simplified into 9-13 broad lobed leaflets (pointed lobes, like the guide), overlapping like roof tiles from root to tip. Big readable shapes; NO needles, NO fine noise, NO veins except one soft central stroke per leaflet.
- Painted look: opaque flat-brush strokes, 3-4 clear tone bands per leaflet, crisp silhouette edges.
- Colour/value: strong gradient along the bough — root leaflets deep cool green (blue-green, dark), middle leaflets medium green, tip leaflets light warm yellow-green, the very tip pale cream-yellow-green. Each leaflet: darker at its base and where the leaflet above overlaps it, lighter at its tips. Dark accents only in overlaps. No pure black, no grey; keep everything green/yellow-green. No cast shadows, no flat lighting direction.
- The four boughs should differ (fullness, leaflet count, slight curve) but share the same palette.

Save the best result as `art/painted-gen/conifer_m0187/painted.png` (exactly 1024x1024 RGB). Save the prompt you used as `art/painted-gen/conifer_m0187/prompt.txt`. If the first result breaks a requirement (wrong layout, non-flat background, touching boughs, needles/noise), regenerate up to 3 times and keep the other tries as `try1.png` etc.

## Report (last message, short, Japanese)
Files written, how many tries, anything that does not meet the requirements.
