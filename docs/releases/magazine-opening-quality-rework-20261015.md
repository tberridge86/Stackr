# Magazine reveal quality hold — 15 October 2026

The owner rejected the six demonstrations as substantially worse than the
original Shining Mew concept and required actual CoroCoro magazines and inserts.
PR #374 had merged as `d3edfed0943f85f2c119ee7111f9e63137035abb`, but this
feature started no native build, TestFlight submission or OTA publication.
Its implementation is withdrawn while the real-magazine treatment is rebuilt.
Do not publish the rejected implementation or treat its runtime checks as visual
acceptance. The original implementation, source receipts and review remain in
Git history; adjacent artwork batches and existing CoroCoro library records are
outside this withdrawal.

## Concrete faults and corrections

- The implementation replaced the real printed insert and original drag-to-tear
  interaction with generic illustrated paper. Real covers, original printed
  inserts, readable card fronts and convincing paper movement are required.
- The bundled `touch-change-1998.jpg` was incorrectly matched. It depicts the
  old-frame, unnumbered **2002 Touch Generation Change!**, with the printed title
  タッチ世代交代! and Tomokazu Komiya credit. The 1998 Fan Club volume 5 card is
  **Touch Change!**, タッチ交代!, credited to Nobuyuki Habu. The incorrect image is
  not the e-card-frame 027/P twin either. Both 2002 versions must stay distinct
  from the 1998 card. The previous artwork receipt's exact-match assertion is
  rejected. No catalogue/card ownership row was written for that unmapped card.
  The rejected immutable hash, original source and correction are preserved in
  [`magazine-opening-rejected-asset-20261015.json`](magazine-opening-rejected-asset-20261015.json).
- The Fan Club volume 5 reference photograph shows clear outer wrapping and a
  separate clear card packet. A perforated paper-packet description is not
  established by that photograph and must not be presented as the original
  opening method.
- The April and December 1998 instruction scans gathered during refinement show
  the backs of the carriers at only 300 × 426 pixels. They are research references,
  not high-quality front textures for a release. A linked image on the November
  1996 Jigglypuff information page even points to a differently dated filename;
  article context cannot establish which object a photograph depicts.

Identity references: [1998 Touch Change!](https://pokeboon.com/fanclub_touchchange_promo/),
[physical 1998 front](https://pokeboon.com/wp-content/uploads/oldback-300x-re-name/funclubvol5-touchchange-promo.jpg),
[Fan Club volume 5 and sealed packet](https://pokumon.com/pokemon-card-fan-club-magazine/).

## Rebuilt Shining Mew design reference

A separate local design preview now uses the owner-supplied May 2001 magazine
cover, the original printed Mew sleeve, a photograph of that sleeve inside the
issue, and the sharper exact-2001 card image used by the original demonstration.
It opens the cover from the right-hand binding, focuses the insert, restores the
downward pull interaction, folds the front and settles the card at its displayed
size to avoid a permanently scaled, blurry thumbnail. Stackr branding remains on
the surrounding mat and controls, not invented historical packaging.

Preview: `http://127.0.0.1:58411/`.
Artifacts: `D:/Stackr-recovery-artifacts-20261009/runtime-temp/magazine-opening-quality-20261015`.
The original preview at port 58409 is preserved. The new browser capture is
`mew-original-magazine.webm`; it is a design demonstration, not installed iPhone
evidence or a video of a physical unsealing. Printed artwork bytes are unchanged.

Browser checks cover the real cover/inside/insert images, tear interaction,
replay, reduced motion and widths 320/390/430/820, with no runtime errors or
non-GET requests. A separate recorded run exercises both cover drag and tear
drag. Collection actions are preview-only; no real account or collection changes.

The magazine opening and exact tear direction remain an interactive
reconstruction, not a newly proven physical opening method. Additional reference
photographs retain their source URLs and hashes. Neither online availability nor
an earlier generic permission claim is converted into newly verified production
rights for a different seller's photograph.

## Next acceptance boundary

Use the actual issue and correct carrier/packaging for every scene. Source high
quality fronts and confirm each printing before extending the improved treatment.
Keep the twelve missing catalogue mappings explicit. The owner has been shown
the concrete new Mew preview and asked for movement/detail preferences while
independent source investigation continues. No new production publication is
claimed or queued by this receipt.

## Withdrawal checks

The staged inverse of the exact feature squash matched its parent
`85a4812a2798af903ed8b73a6611a7e568666244` byte for byte before these two
new evidence documents were added. This preserves the three artwork commits
between the original feature baseline and that parent. The same approved
independent reviewer confirmed the bounded reversal and the identity/packaging
corrections without changing files or running live operations.

After withdrawal, TypeScript and Expo lint pass (zero lint errors, eight inherited
warnings); the existing CoroCoro screen mount and curated catalogue regression
pass. Logs are retained with the local quality-preview artifacts. Hosted checks
remain required on the withdrawal PR. No app build is required to inspect or
deliver this source withdrawal; it makes no claim that a new app was installed.
