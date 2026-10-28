# 画像生成指示

組み込みimagegenを使用。生成画像の完成像を部品作りとモデル比較に使う。ROのゲーム画面は生成ツールに送らず、手元で観察した特徴を文章にする。

## 共通の完成像

Use case: stylized-concept. A single complete cute but natural fir tree for a classic hand-painted Korean fantasy MMORPG environment. Three-quarter elevated view about 35 degrees, entire tree and grounded trunk base visible, centered with generous margins, warm ivory plain backdrop, soft upper-left daylight. A rounded tapering conical crown with naturally staggered tiers, broad drooping branch sprays made of many SHORT PLUMP NEEDLE CLUSTERS. Muted moss/olive greens with soft yellow-green top faces and cool green interior shade. Rounded branch-cluster tips, little individual needle detail, soft painterly color gradients and readable volumes. Natural central leader, subtle asymmetry. Cozy, gentle, graceful, not a toy. No hard polygon edges, no fern fronds, no broad banana leaves, no saw-blade edges, no Christmas ornaments, no snow, no text, no scenery, no glossy plastic. Maintain the appearance of a living fir, Abies-like short needles grouped densely along twig sprays.

- A: softly conical crown, clear but rounded layered silhouette, the baseline design.
- B: same style and view, a slightly fuller rounder lower skirt and compact proportions.
- C: same style and view, gently offset branch tiers and a subtle curved central leader, restrained natural asymmetry.

保存先は `concepts/A.png`、`concepts/B.png`、`concepts/C.png`。Bは2本出たので、モデルの直接の部品には使っていない。

## v1〜v3の枝部品

次の共通文に、下の各文を追加して3回生成した。すべて透過指定、入力画像なし。生成PNGのRGBAを保ったままコピーし、画像加工はしていない。

Create a game texture: ONE SHORT CUT FIR BRANCH SPRIG ONLY, lying HORIZONTALLY from LEFT to RIGHT, isolated on genuinely transparent background. A small botanical clipping, NOT A TREE. Its single slender brown twig starts at the LEFT CENTER and ends at the RIGHT CENTER, with several small side twigs densely covered in PLUMP SHORT BLUNT FIR NEEDLES forming soft rounded tufts. Overall shape is 3 times wider than tall. Hand-painted fantasy RPG foliage, muted olive/moss green, gentle yellow-green tips and cool-green shaded undersides, soft brush gradients, cute natural shapes. Top-down orthographic texture view, very soft diffuse illumination, NO background glow or halo, NO cast shadow. Entire sprig and exposed short cut twig visible, generous clear margin. No vertical trunk, no tree silhouette, no stacked triangular crown, no roots, no broad leaves, no fern, no palm leaf, no Christmas decorations, no ground, no text.

- `assets/branch-dense.png`: One BROAD dense branch clipping with about five irregular overlapping needle tufts on each side of the central twig. Soft chunky lobed silhouette, asymmetrical.
- `assets/branch-droop.png`: One LONGER graceful branch clipping, a gently curved brown twig with irregular hanging needle tufts; slightly slimmer than the dense branch. Still horizontal left to right.
- `assets/branch-tip.png`: One SHORT COMPACT terminal twig clipping with only 3 or 4 small needle tufts on each side, softly rounded terminal bud. Still horizontal left to right.

これ以前に、生成した完成像Aを参照画像として枝部品を3枚作ったが、木全体の形へ引っ張られたため不採用。ROの画面は画像生成へ渡していない。

## v4の枝部品

組み込みimagegen、入力画像なし、透過指定。保存先 `assets/branch-soft-v4.png`。以下が最終の指示全文。

Use case: stylized-concept. Asset type: transparent foliage texture for curved branch cards in a hand-painted fantasy MMORPG.
ONE HORIZONTAL FIR BRANCH SPRAY, cut attachment at LEFT, soft terminal end at RIGHT, three times wider than tall. Orthographic top view. A single twig covered by 7 to 9 BROAD SOFT ROUNDED TUFT MASSES, shaped like overlapping plump drooping pine boughs. The tufts consist of short dense fir needles, but simplify the needles into a few broad subtle brush strokes. Paint volume in LARGE QUIET COLOR GRADIENTS, 90% broad color masses, 10% understated needle hints. Cute natural classic Korean RPG background art. Soft scalloped clump edges, blunt ends, rounded lobes, no sharp serrations. Muted light sage / moss / olive greens; cool moss shadows and gentle warm green tip highlights. Mid-value local colors, very low contrast, no bright yellow.
A little brown twig is visible only at the LEFT attachment and mostly hidden within the leafy masses. Asymmetric but continuous branch fan. Keep most of the spray centered vertically; individual side tufts may bend gently downward toward RIGHT. Genuine transparent alpha background and generous margin all around. NO background, halo, cast shadow, snow, cones, text, broad banana leaves, fern leaves, whole tree, vertical trunk, stacked conical tree, high-frequency photorealistic needles, scale patterns, spikes.
## v5: 短く幅広い枝先の房

組み込みimagegen、入力画像なし、透過指定。保存先 `assets/branch-fan-v5.png`。RGBAの生成結果をそのままコピーした。以下が指示全文。

Use case: stylized-concept. Asset type: ONE transparent foliage texture for a short FIR branch tip on curved 3D cards.
Paint a SINGLE COMPACT BROAD FAN of conifer foliage, approximately 1.5 times wider than tall. The tiny attachment starts at the LEFT CENTER, then a mostly hidden twig divides into THREE SHORT twig fingers fanning toward the RIGHT. Each finger ends in a plump rounded drooping tuft of short fir needles, with a few smaller overlapping tufts. The entire clipping has a chunky soft scalloped silhouette. Keep fingers close enough to overlap; a connected leafy mass. It must read as a small fir bough, not a whole tree, not a long frond.
Classic hand-painted fantasy MMORPG background texture. Broad smooth brush shading and large rounded volumes. Individual short blunt needles only suggested by a few soft strokes, no sharp needles or fine noisy detail. Muted moss green, soft olive upper surfaces, cool deep green lower folds, gentle pale green tips. Medium-dark greens, no bright yellow. Exposed brown twig ONLY at the very small left attachment; ALL other stems covered by foliage, no sticks extending outside the silhouette.
Orthographic top-down view of the clipping laid flat; genuinely TRANSPARENT background, generous transparent margin, no cast shadow, no halo. No whole tree, vertical trunk, ground, long feather, palm, fern, banana leaves, spikes, serrations, repeated scale pattern, text, snow, ornaments.

生成結果のプレビューには外周の色が見えたため、透過のサンプルを読み取った。外側の緑にはalpha=0があり、RGBの色だけではにじみの有無を判断できなかった。念のため周囲の光を消す編集も生成したが、その版は彩度とコントラストが強まったため不採用。採用した元画像をThree.jsの実画面で確認し、矩形や周囲の光が出ないことを確認した。

不採用編集の指示: Precise edit of the provided foliage texture: remove ALL soft green/brown glow, vignette, shadow and haze surrounding the foliage. The background must be completely transparent right up to the crisp painted silhouette. Keep the branch clipping itself, all its shapes, brush texture and colors unchanged. Preserve every foliage tuft and the small left attachment. This is a cutout game texture, no illumination outside the leaf edges, no soft alpha cloud. Genuine clean transparent PNG.
