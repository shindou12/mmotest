# Greatsword base model refinement

The Greatsword registry has four shape IDs. Each now has one refined model that retains its original style ID, shared toon material pipeline, and two-hand grip anchor.

| style | form | refinement |
|---:|---|---|
| 0 | Balanced greatsword | Wider, centered profile with a clear blade ridge and extended grip |
| 1 | Cleaver | Squared cutting slab, clipped shoulders, and a heavy bolster |
| 2 | Zweihänder | Narrower, longer blade with parrying hooks and a longer two-hand grip |
| 3 | Flamberge | Readable wavy edge with a restrained warm fuller and branch guard |

Style 3 also remains the shared model for Greatsword legendaries, as it was before this change. The updated style is therefore shown both in the basic model lineup and on existing legendary Greatswords.

No attack data, motion tracks, character bones, damage values, or skill behavior changed. The lower support-hand placement remains on the handle for all four styles.

Open `public/greatsword-refine.html` to compare the current and refined versions side by side. It uses the existing Root / Passive View / bubbling events / Mediator state pattern and includes front, three-quarter, and side views.
