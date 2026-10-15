# Sword model refinements

The selected one-handed sword models and the two newly registered unique swords use the same toon materials, outline treatment, grip anchor, and network appearance field as the rest of the game.

| style | item or family | model read |
|---:|---|---|
| 0 | Ordinary straight sword | Slim, straight blade with a compact guard |
| 1 | Ordinary katana | Single edge, subtle curve, low-profile guard |
| 2 | Ordinary leaf blade | Symmetric leaf profile and center ridge |
| 3 | Legacy / unmatched legendary sword | Compatibility shape for older and unknown IDs |
| 4 | `amenomurakumo` 天叢雲剣 | Cloud guard, jade grip, magatama pommel |
| 5 | `durandal` デュランダル | Ivory steel, blue grip, shield-shaped center fitting |
| 6 | `laevateinn` レーヴァテイン | Dark wavy blade, ember core, branch guard |
| 7 | `oni_kiba` 鬼牙 | Forward-hooked blade and bronze guard |
| 8 | `sosei` 双星剣 | Slender blade with a clearly split tip |

The new swords are rarity 6 unique items and are now in the unique item pool. This change adds their names, lore, and dedicated models; it does not add combat effects. `weaponStyle(item)` resolves their stable IDs through `shared/weapon-appearances.js`, then the existing `wst` field carries the same approved style to other players. Equipment, remote-player models, and dropped weapons all use `makeWeapon`.

The player skeleton and two-handed grip positions are unchanged. The old straight, katana, leaf, and unique sword shapes remain visible in the comparison pages; only the production model registry selects the refined geometry.

## Preview pages

- `public/swords-next.html` compares the two newly registered shapes with the prior sword lineup.
- `public/swords-refined.html` shows the ordinary and established unique sword models, including equipment and motion views.

## Verification

- The sword-adoption tests cover all five unique sword IDs through equipment and loot, plus appearance synchronization for styles 4–8.
- Existing grip, animation, and pose checks continue to use the original sword hand anchor.
