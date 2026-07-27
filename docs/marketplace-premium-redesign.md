# Stackr Marketplace Premium Redesign

## Prototype Comparison

| Prototype | Recognition speed | Comprehension | Visual quality | Tap accuracy | Product trust | Conversion fit | Scroll depth |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A. Two-column seller-image-led grid | Strong for exact raw cards and lots | Clear condition signal, inconsistent product identity | Depends heavily on seller photo quality | Good | Highest for raw cards and slabs | Strong for condition-sensitive items | Medium |
| B. Two-column mixed-image grid by product type | Strong across raw, graded and sealed | Best balance of identity, price and condition | Most consistent without hiding seller evidence | Good | High, because catalogue images are labelled | Best overall | Medium |
| C. Responsive three-column compact discovery grid | Fastest scanning on wider screens | Lower detail density per card | Premium when width is enough, cramped when forced | Lower on narrow screens | Medium | Good for browsing, weaker for decisions | Lower |

## Recommendation

Use prototype B as the default marketplace layout: raw cards and lots lead with seller photos, graded slabs lead with slab photos, and sealed products can lead with labelled catalogue artwork. Keep the normal mobile grid at two columns. Offer compact three-column discovery only when card width remains readable.

## Implementation Notes

- Header controls are reduced to Filter, Sort and an optional compact layout toggle.
- Active filters appear only as removable chips after selection.
- Grid cards prioritise image, name, set/number, price, condition/grade, seller confidence and favourite.
- Search suggestions separate catalogue card discovery from live marketplace products and show listing counts.
- Seller location and delivery method are present in the filter flow as pending data fields, rather than fake filters.
