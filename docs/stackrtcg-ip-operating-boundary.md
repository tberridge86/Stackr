# StackrTCG intellectual-property operating boundary

**Status:** Risk-managed internal permission-to-proceed record  
**Company:** StackrTCG Ltd.  
**Companies House number:** 17386590  
**Registered:** 7 August 2026  
**Founder and director:** Jack Berridge  
**Effective date:** 4 September 2026  
**Review owner:** Jack Berridge  

## Purpose and legal status

This record authorises StackrTCG development work that stays within the controls below. It is intended to let product, catalogue, OCR, marketplace, seller-inventory, localisation, moderation, and documentation tasks proceed without repeatedly reopening the same internal decision. It also records the director's acceptance of a measured level of residual intellectual-property risk where StackrTCG relies in good faith on a public API, open database, asset provider, user submission, or established marketplace pattern and applies the controls in this record.

This record is **not**:

- permission, approval, endorsement, or a licence from The Pokémon Company, The Pokémon Company International, Nintendo, Creatures Inc., Game Freak Inc., an artist, or another rights holder;
- a substitute for advice from a qualified intellectual-property solicitor;
- authority to scrape a source, breach source terms, copy an official database, or deploy an asset outside the documented user-content or controlled-provider routes below;
- authority to deploy to production, contact third parties, accept licence terms, incur fees, or make external legal representations without the separate approval normally required for those actions.

No disclaimer or takedown procedure creates a right to use protected material. The defensible position depends on the product behaving exactly as described in this record.

## Product purpose

StackrTCG is an independent collection-management, card-recognition, seller-inventory, and secondary-market technology service for trading-card collectors and retailers.

The intended product benefits are to:

- help collectors identify and organise the physical cards they own;
- present cards in their original language while providing supplemental English identification information;
- support English, Japanese, Traditional Chinese, and Simplified Chinese releases;
- let sellers sweep, identify, reconcile, and manage their own physical inventory;
- help smaller local shops make genuine stock discoverable;
- show participating vendors without implying manufacturer endorsement;
- improve condition, identity, availability, and pricing transparency;
- discourage counterfeit goods, misleading listings, and opportunistic resale practices; and
- use recognition technology to improve the collecting experience without generating replacement artwork.

Jack Berridge has been a Pokémon fan since 1999. The commercial aim is to recover the personal investment made in developing StackrTCG, create a sustainable company, and ultimately enable Jack and his son to open a local TCG store.

## Core operating position

StackrTCG identifies and facilitates the organisation and resale of genuine physical goods. Its permanent catalogue may use independently compiled factual information, user photographs in their original context, and proportionate reference assets delivered through an approved or conditionally approved third-party provider. StackrTCG must not copy imagery directly from Pokémon-operated services or treat unrestricted internet availability as permission. Third-party names may be used where reasonably necessary to identify genuine products and in a manner intended to follow honest commercial practices.

Public marketplace photographs must be supplied by users, depict the specific physical items offered, and remain tied to the relevant listing. StackrTCG must not convert user photographs into a permanent stock-image catalogue. StackrTCG must not claim hosting-intermediary protection for content that StackrTCG selects, commissions, imports, or uploads itself.

Comparable services including eBay, Rare Candy, HoloDex, Collectr, PokePulse, Pokellector, and TCGdex show an established market for non-affiliated card identification, reference, scanning, pricing, collection, and resale tools. Their conduct is not legal permission, but it is relevant to StackrTCG's good-faith, risk-based product design. StackrTCG may follow those established functional patterns while remaining visibly independent, proportionate, responsive to complaints, and stricter about provenance and reuse.

## Permission matrix

### Owner-only recognition evaluation: standing internal approval (5 September 2026)

The owner's written instructions in the Stackr Codex task on 5 September 2026 approve implementing and deploying private recognition for their own signed-in account in a production-configured app. This section records that internal decision now; it is not pending a second amber form, a staging-only review, or another confirmation phrase. It supersedes earlier internal records that prohibit activation solely because that private-evaluation review is pending. Historical records remain unchanged.

Within this scope, work may proceed with the existing pinned SigLIP FP32 baseline, its documented non-reconstructive reference gallery, authenticated matching of the owner's own physical-card photographs, private capture/label collection, diagnostics, and an owner-distributed app build. Existing production infrastructure may be used; a separate staging environment is not required. Model processing may run on the private server while native inference is completed. The app must accurately disclose which route it uses.

Owner access is enforced by server-verified identity and an explicit owner allowlist, not by an admin label, build-link secrecy, or a client feature flag. Automatic acceptance and auto-add remain off. Recognition photographs are transient unless the owner explicitly saves a capture to their private dataset; saved captures have deletion controls and are not automatically used for training or public catalogue artwork. Real-device accuracy and performance must be measured, not inferred from synthetic benchmarks.

This is an internal approval for the specified personal evaluation, not a claim that personal use grants additional third-party rights. It does not expand source access, permit prohibited scraping, expose a public image corpus, or approve a general commercial recognition rollout. Ordinary technical verification and account isolation still apply.

### Owner-only pricing: personal-use engineering direction (6 September 2026)

The owner's written instruction on 6 September 2026 is: "im using this for personal use. please stop asking about permissions. carry on". This records personal-use scope and permission to continue its implementation and technical verification. Do not repeatedly ask for permission documents or reopen the internal decision while green engineering work remains.

Pricing access must be enforced for the configured owner's server-verified account, including legacy HTTP routes and direct database access. Personal pricing responses must not enter shared caches. Ordinary catalogue metadata may remain public. This direction does not approve public provider-data redistribution or imply that an estimate is an individual sale.

Continue with existing source controls and available evidence; do not invent provider grants, complete an unperformed manual benchmark, or claim that tests certify real-world sold-price accuracy. Record technical rollout requirements without turning them into repeated permission prompts.

### Green: development may proceed

The following work is internally approved, subject to ordinary security, privacy, quality, and deployment controls:

- Compile objective card facts from lawful, independently reviewed sources.
- Store card names, set names, collector numbers, language, region, rarity classifications, release dates, printed statistics, and other objective product characteristics.
- Record field-level provenance, retrieval dates, source terms, and reviewer decisions.
- Present the authentic printed language as the primary display value and add clearly labelled English supplemental identification text.
- Use plain text to identify genuine third-party products where reasonably necessary.
- Use neutral StackrTCG-designed placeholders where cleared imagery is unavailable.
- Query a documented public API or open database for factual metadata when its published licence or terms permit the intended access and StackrTCG records the source, licence version, retrieval date, and attribution.
- Use TCGdex catalogue metadata under its published MIT database licence with the required copyright and permission notice preserved in StackrTCG's third-party notices.
- Display a provider-served low-resolution card reference image in search, collection, recognition-match, set-checklist, or product-identification views when the provider expressly supplies card image URLs for application use and the controlled-provider conditions below are satisfied.
- Cache or transform a controlled-provider reference image only to the minimum extent permitted or technically required for reliable delivery, with a short retention period and source-level removal switch.
- Compute private, non-reconstructive recognition features from a controlled-provider reference image when processing is limited to identification, the original is not exposed as a downloadable archive, and the provider record does not prohibit that processing.
- Allow a user to photograph a physical card in the user's possession for private collection management, inventory processing, or a specific marketplace listing.
- Perform OCR and image matching on a voluntarily submitted photograph to extract the minimum identifiers needed for card recognition.
- Produce non-reconstructive hashes, embeddings, dimensions, confidence scores, and matching evidence needed for identification, provided they are not used to recreate protected artwork.
- Let sellers scan or sweep their own physical inventory and review matches before committing records.
- Display a seller's photograph only with that user's collection record, inventory record, or listing.
- Resize, cache, and compress a user photograph only as necessary to provide the user-requested feature.
- Retain limited evidence needed for fraud prevention, disputes, moderation, backups, and legal compliance under a documented retention schedule.
- Promote local vendors using their own authorised business names, information, and media.
- Implement authenticity warnings, counterfeit reporting, moderation, takedown handling, and repeat-infringer controls.
- Continue professional licensing outreach for permanent official images, logos, symbols, and authorised asset feeds.

### Amber: proceed only after a recorded rights review

The following uses require a source-specific and feature-specific written review before activation:

- Public display of a user photograph outside the exact listing or inventory context for which it was supplied.
- Long-term retention of card photographs after a listing, collection record, or inventory record ends.
- Public activation of a third-party API, feed, dataset, repository, or bulk export whose commercial terms are silent or materially unclear; development and private evaluation may continue with pointers or quarantined samples while the review is recorded.
- Repeated extraction of facts from one compiled database, even where individual facts appear unprotected.
- Storage of attack descriptions, flavour text, rule text, translations, or other potentially expressive text beyond the minimum needed for identification.
- Public display of recognition crops, OCR evidence, or diagnostic captures.
- Display of provider-supplied set logos, expansion symbols, rarity graphics, pack artwork, or other marks beyond the minimum card-reference image needed for identification.
- Use of a third-party word mark in advertising, search marketing, app-store metadata, domain names, or prominent product branding.
- Automated recognition corpora derived from user submissions when consent, retention, deletion, or model-training scope is not explicit.
- Any proposed fair-dealing reliance. It must be reviewed for the specific work, purpose, amount, acknowledgement, market effect, and source terms; low resolution alone is not a justification.
- Operation in, or active targeting of, a jurisdiction whose marketplace, intermediary, consumer, privacy, or platform rules have not been assessed.

An amber review must identify the asset or data, source, owner or licensor, permitted purpose, territory, term, transformation rights, storage rights, deletion requirements, attribution, downstream delivery rights, and approving person.

### Red: do not use without written permission or an express provider grant covering the use

The following are not authorised by this record:

- Official card scans or card-face images copied directly from a Pokémon-operated service, another marketplace, search result, or source that prohibits the intended use.
- Official standalone artwork, downloadable master assets, marketing renders, or product photography imported without a documented provider route or express permission.
- Images copied from Pokémon websites, Pokémon TCG Live, another marketplace, search results, social media, or another seller.
- User photographs repurposed as stock images or used to fill permanent catalogue gaps.
- Scraping, bulk downloading, automation, or circumvention prohibited by a source's terms or technical controls.
- Copying or systematically reconstructing a protected third-party database.
- High-resolution, print-ready, standalone, or reconstructable copies of protected card artwork.
- Generative-image training, new Pokémon-style artwork, merchandise, NFTs, proxies, replicas, or printable card reproductions.
- A statement that StackrTCG is licensed, authorised, endorsed, sponsored, partnered, or approved unless a signed agreement expressly permits that statement.

## Controlled-provider reference route

StackrTCG may use provider-distributed card reference assets without obtaining a separate Pokémon agreement first when all of the following conditions are met:

1. The provider operates a genuine public API, SDK, repository, catalogue, or commercial feed intended for third-party application use.
2. The provider itself supplies the exact metadata or image URL; StackrTCG does not discover or copy it from an unrelated website or search result.
3. A published licence, API document, paid plan, contract, or clear provider representation permits use of the database or service. Silence is amber rather than an automatic prohibition.
4. StackrTCG records the provider, endpoint or repository revision, licence or terms URL, retrieval date, attribution requirement, and affected asset population.
5. Public imagery is used as a proportionate card reference inside collection, search, recognition, inventory, checklist, valuation, or marketplace-identification workflows rather than offered as standalone downloadable artwork.
6. Low-resolution or normal in-app delivery is preferred. StackrTCG does not provide print-ready originals, an image-export API, bulk downloads, or an artwork mirror.
7. StackrTCG does not remove copyright notices, watermarks, attribution, provider identifiers, or other rights information.
8. StackrTCG remains visibly independent and does not reproduce Pokémon's overall website, application trade dress, or dominant brand presentation.
9. The source can be disabled promptly by provider, language, set, card, or capability if terms change or a credible rights complaint is received.
10. A takedown and review trail records notices, decisions, removal timing, and any restoration.

This route is an internal commercial-risk decision, not a representation that the provider owns every underlying Pokémon right. The provider's public invitation to use its API or database, its delivery of image URLs, the limited identification purpose, the absence of standalone exploitation, industry practice, attribution, and prompt-removal controls together form the basis for proceeding.

### TCGdex posture

TCGdex's verified GitHub organisation describes its multilingual card database, including card pictures, as open source; the cards-database README states that the database is MIT-licensed and not affiliated with Nintendo or The Pokémon Company. Its documentation expressly exposes low- and high-quality image URLs for application use.

StackrTCG may therefore:

- use TCGdex factual metadata, identifiers, translations, API responses, and database structure with MIT attribution;
- use TCGdex-supplied low-resolution card image URLs as controlled-provider references in ordinary in-app identification and collection views;
- use a high-quality TCGdex image transiently for private matching or verification when the user does not receive a print-ready download;
- retain provider IDs, image URLs, checksums, availability state, and non-reconstructive recognition features; and
- fall back immediately to a neutral placeholder if TCGdex withdraws an asset, changes its terms, blocks use, or receives a substantiated rights complaint.

StackrTCG must not treat the MIT licence as a warranty that TCGdex owns Pokémon's underlying artwork. Bulk mirroring of high-resolution images, permanent downloadable originals, set-logo promotion, model training, and resale of the image corpus remain amber or red depending on the provider evidence.

For StackrTCG's machine-readable source-rights registry, this record authorises a future focused task to propose and validate the following TCGdex capability posture:

- `metadataDiscovery`: `approved`
- `automatedMetadataFetch`: `approved`
- `automatedAssetFetch`: `conditional`, limited to provider-documented endpoints and controlled reference delivery
- `persistOriginalAsset`: `conditional`, limited to short-lived cache or private verification unless stronger evidence exists
- `publicDisplay`: `conditional`, limited to proportionate in-app reference use with attribution and fallback
- `createDerivatives`: `conditional`, limited to delivery resizing, compression, checksums, and non-reconstructive operational transforms
- `createEmbeddings`: `conditional`, limited to private identification and matching
- `trainModels`: `review_required`

That registry change must preserve the evidence URLs above, record the reviewed repository revision or licence snapshot, update the stale terms URL currently held in the registry, and pass the repository's existing rights-policy tests. It must not convert any conditional artwork capability to `approved` or weaken unrelated source entries.

Sources: [TCGdex cards database and licence](https://github.com/tcgdex/cards-database), [TCGdex MIT licence](https://github.com/tcgdex/cards-database/blob/master/LICENSE), and [TCGdex API documentation](https://tcgdex.dev/)

## Factual catalogue controls

Individual facts may fall outside copyright protection, but a compiled database can carry separate copyright, contractual, or database-right protection. StackrTCG must therefore:

1. Collect only fields needed for product identification, organisation, search, inventory, and legitimate marketplace operation.
2. Prefer multiple lawful and independently reviewed sources instead of cloning one catalogue.
3. Keep field-level provenance and the applicable source terms.
4. Avoid bulk extraction when permission is absent or unclear.
5. Avoid reproducing the original source's creative selection, structure, descriptions, or arrangement.
6. Quarantine disputed fields rather than publishing them automatically.
7. Preserve evidence that a human or approved process reviewed material before promotion into the canonical catalogue.
8. Remove or replace a source when its rights, reliability, or commercial-use status cannot be demonstrated.

## Language and localisation controls

- The card's authentic printed name and language should remain visible and primary.
- English text must be labelled as supplemental identification, translation, transliteration, or editorial information as appropriate.
- Do not present an unofficial translation as official.
- Preserve source and reviewer evidence for translated set and card names.
- Do not translate or reproduce full creative text merely to fill a catalogue gap without a documented legal basis.
- Plain-text language labels and neutral StackrTCG UI elements should replace uncleared official flags, set marks, and symbols where necessary.

## User-photograph controls

Users must photograph the exact physical item in their possession. Stock images, official renders, screenshots, copied marketplace images, and another seller's photographs are prohibited.

The upload flow must require the user to confirm that:

- the photograph was taken by the user or the user otherwise has authority to upload it;
- the photograph depicts the actual physical item associated with the record or listing;
- the item is genuine to the best of the user's knowledge;
- the photograph and listing do not misrepresent condition, edition, ownership, or authenticity; and
- StackrTCG may host and process the photograph only for the relevant platform functions and stated retention purposes.

The licence obtained from the user should be non-exclusive, worldwide, royalty-free, and limited to hosting, caching, resizing, processing, and displaying the upload for the relevant account, collection, inventory, listing, moderation, fraud, backup, and legal-compliance functions. It should end when the relevant content or service ends, except for documented residual retention.

A user's ownership of a photograph does not guarantee that the user controls every right in material visible within it. StackrTCG must therefore keep the display contextual, proportionate, and tied to the genuine physical item rather than treating the photograph as a general catalogue asset.

## OCR and recognition controls

Recognition is authorised only to identify and organise genuine physical cards or assist a user with a specific inventory or listing workflow.

The implementation must:

- process photographs submitted by, or with authority from, the user;
- extract the minimum identifiers required, such as name, language, set code, and collector number;
- avoid storing complete expressive text unless separately justified;
- avoid publishing internal crops or diagnostic images by default;
- separate private recognition evidence from public catalogue delivery;
- provide deletion and retention controls consistent with the privacy notice;
- prevent recognition assets from becoming a downloadable artwork repository;
- prohibit generative training, reconstruction, merchandise, proxy, and reproduction uses; and
- keep benchmark and development datasets rights-gated and access-controlled.

The UK text-and-data-mining exception for non-commercial research must not be treated as authority for StackrTCG's commercial OCR or recognition operations.

## Trademark and presentation controls

Third-party word marks may be used only as reasonably necessary to identify or refer to genuine products and must follow honest commercial practices. StackrTCG must:

- keep its own name, logo, colours, and visual identity clearly dominant;
- display a prominent and accurate non-affiliation statement;
- avoid official logos and stylised marks unless licensed;
- avoid language suggesting approval, certification, partnership, or official status;
- avoid placing third-party marks in the StackrTCG company name, primary logo, or domain branding;
- avoid unfair advantage from, or harm to, a mark's reputation; and
- describe vendor relationships accurately and distinguish local sellers from manufacturers and rights holders.

## Counterfeit and marketplace controls

Only genuine physical products may be listed for sale or trade. Counterfeit, proxy, bootleg, unauthorised reproduction, and deceptively altered products are prohibited.

StackrTCG may remove listings, suspend accounts, preserve proportionate evidence, refund or restrict transactions under its marketplace rules, and cooperate with rights holders or public authorities where permitted or required by law. A serious, deliberate, or fraudulent violation may result in immediate termination. Repeated infringement must be addressed under a reasonably implemented policy rather than an inflexible automatic three-strikes promise.

Displaying a listing must not be represented as authentication, certification, or a guarantee of authenticity unless StackrTCG introduces a separately reviewed authentication service.

## Hosting and takedown boundary

UK hosting protections may apply conditionally to information stored at the direction of a user when the applicable requirements are met. They do not confer permission and do not protect content selected, imported, commissioned, or uploaded by StackrTCG.

StackrTCG must:

- provide an accessible intellectual-property reporting address;
- request the reporter's identity and contact details, the right asserted, the exact content location, the alleged unlawful basis, and the reporter's authority;
- record receipt, assessment, action, reviewer, reason, and timing;
- act expeditiously after sufficiently clear knowledge of unlawful content;
- notify affected users where appropriate and provide a fair opportunity to respond;
- preserve evidence proportionately;
- distinguish copyright, trademark, counterfeit, fraud, privacy, and safety complaints;
- maintain a repeat-infringer process; and
- keep the public policy aligned with actual moderation operations.

The UK Electronic Commerce Regulations do not prevent a rights holder from seeking court relief. The EU Digital Services Act is not a UK statute; if StackrTCG offers services to EU recipients, separate EU scope and compliance review is required. A US DMCA claim must not be made unless StackrTCG completes the applicable US designated-agent, notice, user-notification, counter-notice, restoration, and repeat-infringer requirements.

## Public intellectual-property notice

The following text may be used as a conservative public-facing baseline after legal and operational review:

> StackrTCG is an independent collection-management and marketplace service operated by StackrTCG Ltd. StackrTCG is not affiliated with, authorised by, sponsored by, or endorsed by any trading-card manufacturer or rights holder identified on the service.
>
> StackrTCG compiles limited factual product information from lawful and independently reviewed sources for identification, collection-management, inventory, and genuine secondary-market purposes. Third-party names and marks remain the property of their respective owners and are used only where reasonably necessary to identify genuine products. StackrTCG does not claim ownership of third-party names, marks, or artwork.
>
> Marketplace photographs must be supplied by users and depict the specific physical items in their possession. Users may not upload official marketing artwork, stock images, screenshots, images copied from other services, counterfeit products, or misleading content. User photographs are displayed only for the relevant collection, inventory, listing, moderation, and compliance functions and are not converted into StackrTCG stock catalogue images.
>
> Rights holders and authorised representatives may report specific material to [IP CONTACT EMAIL]. A report should identify the reporter, the relevant right, the exact content location, the asserted infringement, and the reporter's authority. StackrTCG reviews sufficiently detailed reports promptly and may remove or restrict material while investigating. This process does not limit any rights or remedies available to a rights holder and does not imply that reported material is necessarily unlawful.

This baseline must be reviewed before publication, completed with real contact details, and kept consistent with the Terms of Service, Privacy Notice, seller rules, moderation process, and application behaviour.

## Licensing request that remains appropriate

StackrTCG should continue seeking a non-exclusive commercial digital licence and authorised asset-feed agreement for:

- official card images in English, Japanese, Traditional Chinese, and Simplified Chinese;
- set names, card names, collector numbers, approved catalogue metadata, and English equivalents;
- set logos, expansion symbols, rarity symbols, pack artwork, and product imagery;
- website, mobile-application, app-store, support, and approved marketing display;
- authorised resizing, thumbnails, compression, format conversion, hosting, caching, and CDN delivery;
- card identification using image matching and OCR;
- an API, bulk feed, archive, or recurring update mechanism;
- necessary hosting-provider, contractor, app-store, and technical-delivery rights;
- worldwide availability and the intended commercial model; and
- written confirmation that the licensor controls, or has obtained approval for, the relevant artwork, logos, artist contributions, and regional assets.

The request should expressly exclude generative-image training, new artwork, merchandise, NFTs, proxies, and printable reproductions unless separately negotiated.

## Release gate

Before any feature covered by this record is released, the responsible reviewer must confirm:

- [ ] Every public image is user-supplied for the exact item, internally created and neutral, expressly licensed, or delivered through the controlled-provider route with recorded evidence and a working kill switch.
- [ ] No user photograph is being reused as a permanent catalogue asset.
- [ ] Every third-party data source has documented provenance and applicable terms.
- [ ] No prohibited bulk extraction or scraping is involved.
- [ ] Native-language and English supplemental fields are accurately labelled.
- [ ] OCR stores only necessary identifiers and rights-gated evidence.
- [ ] Upload consent, retention, deletion, and privacy disclosures match implementation.
- [ ] The counterfeit, reporting, moderation, and repeat-infringer workflows operate as documented.
- [ ] Third-party branding does not imply affiliation or endorsement.
- [ ] Any amber use has a written approval record.
- [ ] Any red use has written permission from the relevant rights holder or an express provider grant that covers the exact use and includes a credible chain of authority.
- [ ] Production deployment has received its separate technical and business approval.

Failure of any applicable check is a stop condition. The feature must remain disabled, private, quarantined, or placeholder-only until the issue is resolved.

## Authority for future StackrTCG tasks

Subject to the boundaries above, future tasks are authorised to:

- build, test, document, and improve factual catalogue, localisation, OCR, private recognition, seller-inventory, marketplace, vendor-discovery, provenance, moderation, counterfeit-control, placeholder, and rights-gating functionality;
- integrate documented public APIs and open databases, including TCGdex, for factual metadata and controlled low-resolution reference delivery;
- implement provider attribution, caching limits, provenance records, image-resolution controls, source-level kill switches, and automatic placeholder fallback;
- use controlled-provider images privately for non-reconstructive matching and publicly as proportionate identification references where this record's conditions are met;
- replace or suppress uncleared imagery;
- add safeguards that make the implementation conform to this record; and
- prepare non-binding licensing materials and internal evidence packs.

Future tasks are **not** authorised by this record to copy images directly from prohibited sources, remove provider attribution, expose bulk or print-ready artwork downloads, misrepresent conditional provider reliance as a Pokémon licence, deploy to production, contact a rights holder, enter an agreement, or incur a charge. Those actions require their own express approval.

When a task encounters uncertainty, it may continue in development with metadata pointers, provider URLs, quarantined samples, neutral placeholders, and non-public evaluation. Public delivery must fall back to a neutral placeholder until the controlled-provider record or a specific approval is complete.

## Approval record

Approved internally by:

**Name:** Jack Berridge  
**Role:** Founder and Director, StackrTCG Ltd.  
**Company number:** 17386590  
**Decision:** Permission to proceed with development tasks that remain within this operating boundary  
**Signature:** ______________________________  
**Date:** 4 September 2026  
**Record basis:** Explicit written instruction from Jack Berridge in the StackrTCG Codex task on 4 September 2026: "OKAY LETS APPROVE ALL OF THESE ITEMS THEN". This records StackrTCG's internal decision only and does not replace a provider licence, written third-party permission, benchmark evidence, or the release gate above.  

## Authoritative reference points

- [UK Intellectual Property Office: copyright exceptions](https://www.gov.uk/guidance/exceptions-to-copyright)
- [UK Intellectual Property Office: digital images, photographs, and the internet](https://www.gov.uk/government/publications/copyright-notice-digital-images-photographs-and-the-internet/copyright-notice-digital-images-photographs-and-the-internet)
- [Copyright, Designs and Patents Act 1988](https://www.legislation.gov.uk/ukpga/1988/48/contents)
- [Copyright and Rights in Databases Regulations 1997](https://www.legislation.gov.uk/uksi/1997/3032/contents)
- [Electronic Commerce (EC Directive) Regulations 2002](https://www.legislation.gov.uk/uksi/2002/2013/contents)
- [Trade Marks Act 1994](https://www.legislation.gov.uk/ukpga/1994/26/contents)
- [European Commission: Digital Services Act questions and answers](https://digital-strategy.ec.europa.eu/en/faqs/digital-services-act-questions-and-answers)
- [US Copyright Office: Section 512 notice-and-takedown requirements](https://www.copyright.gov/512/)

## Review triggers

Review this record before any material change involving official assets, a new data provider, public recognition evidence, model training, a new jurisdiction, EU marketplace targeting, US operations, authentication claims, licensing terms, rights-holder correspondence, or a change to user-image retention or reuse.

At minimum, review it annually and after any material change in applicable law or product behaviour.

## Comparable-platform research snapshot

**Research date:** 4 September 2026

This section records public evidence only. A platform's failure to disclose a licence is not proof that no private licence, settlement, permission, supplier agreement, or other rights arrangement exists. A competitor's continued operation is not legal authority and does not grant StackrTCG equivalent rights.

### TCGdex

TCGdex's verified GitHub organisation operates a multilingual Pokémon TCG API and cards database. Its repository states that the database includes card pictures, is MIT-licensed, and is not produced, endorsed, supported, or affiliated with Nintendo or The Pokémon Company. Its public documentation offers card data and low- and high-quality image URLs for application integrations.

This is stronger provider evidence than a random website image or an undocumented scraper because the project deliberately distributes an API, SDKs, database, image fields, and an express open-source licence. It still cannot conclusively license underlying rights that TCGdex does not own.

Operational lesson for StackrTCG: TCGdex metadata and low-resolution provider-served reference images may use the controlled-provider route. Preserve MIT attribution, do not copy from Pokémon-operated services, avoid a bulk high-resolution artwork mirror, and retain a rapid provider-level fallback.

Sources: [TCGdex cards database](https://github.com/tcgdex/cards-database), [TCGdex MIT licence](https://github.com/tcgdex/cards-database/blob/master/LICENSE), and [TCGdex documentation](https://tcgdex.dev/)

### HoloDex

HoloDex publicly describes a paid card-scanning and collection-management service. Its terms say that it may use submitted images and scan data to improve recognition and database quality. Its intellectual-property clause describes platform material as owned by HoloDex or its licensors. The reviewed public terms did not disclose a Pokémon licence or Pokémon partnership, but the reference to licensors means the absence of public disclosure cannot establish that no rights arrangement exists.

Operational lesson for StackrTCG: scanner and collection functionality is a common market pattern, but user-image improvement rights must be explicit, privacy-aligned, non-generative, retention-limited, and separated from public catalogue delivery.

Source: [HoloDex terms and conditions](https://www.getholodex.com/terms)

### Rare Candy

Rare Candy publicly operates marketplace, vault, collection, pricing, and related services. Its terms describe images, graphics, databases, and other material as Rare Candy property or material supplied by licensors. The reviewed terms did not identify a Pokémon licence or state that Rare Candy is an official Pokémon partner. Its physical-item and vault model is also materially different from importing a universal third-party image catalogue.

Operational lesson for StackrTCG: images of specific inventory and transactions are easier to separate from permanent reference imagery. Wording such as "or its licensors" is not evidence that every visible asset is unlicensed; it may conceal private supplier or rights arrangements.

Source: [Rare Candy terms](https://get.rarecandy.com/terms)

### PokePulse

PokePulse publicly labels itself an unofficial fan resource that is not affiliated with Nintendo, Game Freak, or The Pokémon Company. It states that its prices are obtained through pokemontcg.io and combine TCGplayer and Cardmarket information. This is evidence of a non-affiliated commercial or market-information product operating publicly, but it is not evidence that every data or image use is legally cleared.

Operational lesson for StackrTCG: a non-affiliation statement and source attribution are helpful but do not replace compliance with API, database, image, and commercial-use terms.

Source: [PokePulse](https://pokepulse.app/)

### Collectr

Collectr's public terms expressly state that it is independent and not affiliated with or endorsed by Pokémon and other publishers. Its scanning terms say captured images may be stored temporarily for identification and are not sold or shared except as needed to provide the service or as required by law. Its broader intellectual-property clause also refers to material owned by Collectr, its licensors, or other providers.

Operational lesson for StackrTCG: temporary, purpose-limited scan processing is a useful architecture to emulate. The terms still do not prove the rights status of every reference asset visible in Collectr.

Source: [Collectr terms](https://www.getcollectr.com/terms-and-conditions.html)

### Pokellector

Pokellector currently presents itself as an independent, non-affiliated catalogue and collection application. Its terms state that the text and images on Pokémon cards belong to their respective owners. That disclaimer must not be treated as evidence that Pokémon approved the service.

In 2014, The Pokémon Company International filed a US complaint against Pokellector's operator. The complaint alleged copyright infringement and false designation of origin based on wholesale reproduction of card images, use of expansion-set logos and Pokémon-associated visual elements, enlargable card scans, advertising alongside images, and invitations for users to submit missing scans. Pokémon alleged that it had not authorised those uses and had previously sent notices and a cease-and-desist letter.

The complaint records allegations rather than a final judicial finding on the merits. Public docket summaries indicate that the case ended before trial, but the reviewed public material does not establish the terms of any private resolution. It nevertheless demonstrates that Pokémon has treated a commercial card-catalogue application as more than a source-website terms-and-conditions issue.

Operational lesson for StackrTCG: do not reproduce the pattern alleged in that case. In particular, do not combine permanent scans, official set logos, dominant Pokémon-associated branding, image enlargement, advertising, and requests that users fill catalogue-image gaps.

Sources: [Pokellector current terms](https://www.pokellector.com/terms), [2014 TPCI complaint](https://www.cardboardconnection.com/wp-content/uploads/2014/01/DN1-Pokemon-Complaint.pdf), and [public docket summary](https://dockets.justia.com/docket/washington/wawdce/2%3A2014cv00110/198368)

### eBay

eBay requires listing media to respect third-party rights and encourages sellers to use original photographs of the actual item. Its trading-card Scan to List feature uses a seller's camera image to identify a card, states that the scanned image is not saved, and does not carry reference thumbnails into the finished listing. Sellers then add original photographs of the physical card. eBay also operates a rights-owner reporting programme and prohibits copied website images, unauthorised stock photographs, counterfeits, and replicas.

This architecture closely supports StackrTCG's safest seller workflow:

1. Use a transient camera image for identification.
2. Do not save the identification capture by default.
3. Do not carry a reference thumbnail into the public listing.
4. Require original front, back, detail, and condition photographs of the exact item.
5. Maintain rights-owner reporting, appeals, counterfeit controls, and evidence trails.

eBay's scale, jurisdiction, contracts, catalogue suppliers, and possible private rights arrangements differ from StackrTCG's. Its operation does not itself authorise StackrTCG to use the same reference images.

Sources: [eBay Scan to List](https://pages.ebay.com/scantolist/), [eBay picture policy](https://www.ebay.com/help/policies/listing-policies/picture-policy?id=4370), and [eBay intellectual-property guidance](https://www.ebay.com/sellercenter/resources/intellectual-property)

## Research conclusion

The market evidence supports this narrow conclusion:

> Independent and non-affiliated trading-card catalogue, scanner, pricing, and marketplace services plainly operate in the market. Their common safeguards include non-affiliation notices, descriptive product identification, seller photographs, temporary scan processing, source terms, user warranties, counterfeit rules, and takedown procedures. Public materials often do not reveal whether private licences or settlements exist.

It does **not**, by itself, support this broader conclusion:

> Because similar services are operating, StackrTCG may assume permission to reproduce official card images, set logos, or protected databases.

The relevant grey area includes descriptive product identification, independently compiled or openly distributed database facts, provider-served reference imagery, proportionate user photographs, transient recognition, intermediary liability, and jurisdiction-specific exceptions. Direct copies of official scans and logos remain materially higher risk and are governed by copyright and trademark law in addition to source terms and conditions.

Accordingly, comparable-platform practice supports a looser but controlled route: eBay's pattern remains preferred for seller scanning and listings, while TCGdex-style public APIs may support catalogue metadata and proportionate reference images with attribution, provenance, delivery limits, and a kill switch. This changes provider-served reference imagery from blanket-red to conditional-green and moves provider-supplied set marks to amber. Licensing outreach remains appropriate because it would remove residual uncertainty and permit broader official imagery and branded assets.
