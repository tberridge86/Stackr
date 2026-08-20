# StackR visual source of truth

**Status:** Review gate — not permission to release

**Approved reference point:** 16 June 2026

This document exists because StackR has accumulated substantial product and engineering work without a recent whole-app visual review. Passing code tests is not evidence that the app still feels coherent, premium or easy to use.

## 1. Product identity that must not drift

StackR is a premium, card-first collector vault. It should feel organised, valuable, playful and tactile without feeling noisy, childish or like a generic marketplace.

The product promise is:

> **Collect. Trade. Protect.**

The visual language is:

- white and pale-lavender foundations;
- deep-navy primary typography;
- one vivid-purple action/selection colour;
- sparse gold micro-accents rather than large gold surfaces;
- rounded cards and panels;
- soft, controlled shadows and glass-like depth;
- card artwork and binder artwork given visual priority;
- generous spacing and short, direct copy;
- glossy collectible character without visual clutter.

The current canonical tokens are:

| Role | Token |
| --- | --- |
| App background | `#FFFFFF` |
| Soft surface | `#F7F3FF` |
| Selected surface | `#EEE7FF` |
| Primary text | `#07145F` |
| Secondary text | `#36306F` |
| Muted text | `#716BA8` |
| Border | `#E8E1FF` |
| Brand/action purple | `#6938F5` |
| Gold accent | `#FFBE35` |

## 2. Navigation contract

### Collector mode

The persistent navigation is exactly:

1. Home
2. Collection
3. Scan
4. The Market
5. Search

Profile, settings, notifications, offers, orders, achievements, community, Pokédex, set discovery and duplicates are secondary destinations. They must not silently become additional primary tabs.

Scan remains the raised centre action. The tab bar should be visible on ordinary collector screens and absent during focused flows such as scanning and listing creation.

### Seller mode

The seller navigation is exactly:

1. Home
2. Inventory
3. Scan
4. The Market / Listings

Seller mode must feel like a mode of StackR, not a second unrelated app.

## 3. Screen contracts

### Home

The first screen hierarchy is:

1. StackR identity and compact account controls;
2. total collection value and today's movement;
3. a small set of useful actions;
4. Continue Binder;
5. Opportunities, including duplicates/chase/movers;
6. Recent Activity.

Minty may provide a concise insight inside the value experience, but must not dominate the screen or make the home page feel like an AI dashboard. Community is a secondary action, not the core purpose of Home.

### Collection

Binders are the hero. Each binder should make completion, owned count and value quickly understandable. Set discovery, Pokédex and duplicates are useful shortcuts but remain visually secondary to the user's actual binders.

The collection must not become a general discovery homepage.

### Binder detail

The card grid is the product. Users must be able to understand owned, missing, duplicate and variant states without opening every card. Grid density controls, master-set behaviour and graded/raw modes must not obscure the cards themselves.

### Scanner

The scanner is a focused full-screen tool:

- one central card guide;
- minimal top controls;
- one primary instruction at a time;
- clear idle, ready, locked, identifying, ambiguous and failed states;
- tactile sequence: ready tick → capture click → exact-match click/thump;
- no authoritative success haptic for an ambiguous language, set, number or variant;
- manual fallback available without restarting the entire experience.

Diagnostic and engineering information must remain hidden from ordinary users.

### The Market

The Market remains card-first. Search, mode and essential filters are visible; advanced filters belong in a sheet or progressive disclosure. Listing cards prioritise the item image, identity, price/trade value, protection state and seller trust.

The screen must not open as an admin console containing every possible filter and workspace control.

### Seller and listing creation

Listing creation is a guided sequence, not a long form. Catalogue imagery and seller photographs must be clearly distinguished. Users should understand what is required, why it is required and what remains.

Technical provider names, internal review terminology and integration implementation details should not dominate customer-facing copy.

### Profile and family

Profile is entered from the avatar rather than occupying a primary collector tab. Child/family controls must have explicit permissions, spending/trading restrictions and clear ownership boundaries before release.

## 4. Density and behaviour limits

- No new primary navigation destination without explicit product approval.
- No more than three compact controls in a standard top-right header group.
- No more than one dominant hero per screen.
- No more than five immediate Home quick actions.
- Advanced filters use progressive disclosure.
- Empty states explain one next action rather than several competing actions.
- A feature may exist in code without being promoted into the user journey.
- Legacy routes may redirect, but must not create duplicate visible flows.
- Incomplete or unverified features remain behind a disabled flag or internal route.
- Haptics confirm meaningful state changes; they do not fire for every ordinary tap.

## 5. Current repository assessment — 19 August 2026

### Still aligned

- StackR name, icon, splash and URL scheme remain configured as StackR.
- The light-only palette still matches the approved white/lavender/navy/purple direction.
- Collector navigation still resolves to Home, Collection, Scan, The Market and Search.
- The Home code still contains the approved value hero, Continue Binder, opportunities and recent activity structure.
- Collection remains binder-led and preserves binder artwork, completion and value.
- The Market remains image-led and distinguishes seller photographs from catalogue imagery.
- Scan is a focused full-screen route with explicit capture/recognition states.

### At risk of drift

- Home has accumulated Minty, five actions, binder continuation, opportunities, chase marketplace matching and activity. The hierarchy needs visual review on a real device.
- Collection has accumulated Discover Sets, Pokédex and Duplicates shortcuts above or around binder content. Their visual weight needs review.
- The Market has a very broad filter, sorting, workspace, availability, language, grader, grade, rarity, protection and listing-mode surface. Progressive disclosure must be visually verified.
- The scanner and listing flows are large and technically sophisticated. Customer copy may be carrying internal implementation language.
- A substantial legacy route tree still exists alongside newer routed flows.
- Collector and seller modes share a shell but may feel like different products without a current whole-app review.

### Operational blockers

- There is no current checked-in screenshot pack proving the rendered app matches this document.
- The latest `main` revision has failed Railway deployment statuses.
- Staging mobile publication is manually dispatched; repository changes are not proof that the phone build contains them.
- `main` is currently unprotected, so direct changes can bypass review discipline.

## 6. Required visual evidence before further feature expansion

Capture the following on a real iPhone-sized viewport and at least one Android viewport:

1. Login and profile setup
2. Home — empty collection
3. Home — populated collection
4. Collection — no binders
5. Collection — several binders
6. Binder detail — 1×1, 3×3 and 5×5 grids
7. Binder detail — missing, duplicate, raw, graded and master-set states
8. Scanner — initial, ready, locked, identifying, exact match, ambiguous, failure
9. Scan result — one match and multiple matches
10. Market — default browse, search, filters, listing detail and My Listings
11. Seller Home and Inventory
12. Listing creation — identity, condition, value, protection, evidence, review and success
13. Profile, settings and collector/seller mode switch
14. Empty, loading, offline and error states for each core area

For every screen record:

- screenshot;
- route and app mode;
- device/viewport;
- build/channel and commit SHA;
- data state used;
- pass, revise or reject;
- specific revision notes.

## 7. Release rule

No readiness percentage should increase because a component or route exists. A visual facet is complete only when the rendered screen is reviewed against this source of truth and the exact build identity is recorded.

Until the evidence pack exists, StackR should be described as **code-complete in parts but visually unverified as a whole**.
