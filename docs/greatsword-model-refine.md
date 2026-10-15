# Greatsword model refinement and expansion

The four original Greatsword forms retain their IDs, toon pipeline, and two-hand grip anchor. This phase adds two ordinary silhouettes and gives both existing Greatsword uniques their own model.

| style | form | role |
|---:|---|---|
| 0 | Balanced greatsword | Refined original: broad centered blade and long grip |
| 1 | Cleaver | Refined original: squared slab and heavy bolster |
| 2 | Zweihänder | Refined original: narrow long blade and parrying hooks |
| 3 | Flamberge | Refined original: wavy edge and branch guard; remains the legacy fallback |
| 4 | Ōdachi | New ordinary form: curved single edge and round guard |
| 5 | Falchion | New ordinary form: forward-swept single edge |
| 6 | Excalibur | Dedicated unique: ceremonial guard, pale blade, and blue jewel |
| 7 | Dainsleif | Dedicated unique: one-sided jagged edge, blood-colored fuller, and dark iron |

Excalibur and Dainsleif previously both resolved to style 3. They now resolve from `item.unique` to styles 6 and 7, respectively. Ordinary Greatswords keep their old style selection for most names; the two added forms are selected deterministically for some ordinary drops. All IDs pass through the existing snapshot `wst` field.

No attack data, motion tracks, character bones, damage values, or unique FX changed. The lower support hand stays on the handle for every style.

Open `public/greatsword-refine.html` for the original four-form refinement comparison, or `public/greatsword-expansion.html` for all six ordinary models and before/after comparisons of both uniques. The new page uses the existing Root / Passive View / bubbling events / Mediator pattern, with front, three-quarter, and side views.
