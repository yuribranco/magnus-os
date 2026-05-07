---
name: ba
description: Use when writing, reviewing, diagnosing, or rescuing ad copy — VSL scripts, landing pages, headlines, email subject lines, Meta/Google ads, sales letters, product pages, email sequences — especially when copy feels flat, the headline isn't landing, a market is saturated with similar offers, a product is slipping, or you need to decide the angle before writing a single word. Applies Eugene Schwartz's Breakthrough Advertising frameworks.
---

# /ba — Breakthrough Advertising (Eugene Schwartz)

## Step 0 — Read business-brain.md (REQUIRED if running inside a Magnus project)

If a `business-brain.md` exists at the project root, **read it first**. Extract:

- **ICP** → calibrates who the copy is FOR (mass desire detection starts here)
- **Top 3 offers** → which offer is this copy serving? Each has different awareness/sophistication context.
- **Voice (3 always + 3 never)** → all generated copy must respect these rules. Headlines, leads, CTAs all stay within voice.
- **Anchor rule** → if it says "always declare Schwartz awareness in comment", every output must comply.

If `business-brain.md` has placeholders unfilled, ask the user to fill them before generating copy. Without it, output is generic and disconnected from the real business.

If running outside a Magnus project (no business-brain.md present), proceed normally with the diagnostic workflow below.

## Overview

**Advertising does not create desire. It channels pre-existing mass desire onto a product.** This is the single most load-bearing idea in the book, and it governs every decision downstream.

> "The power, the force, the overwhelming urge to own that makes advertising work, *comes from the market itself*, and not from the copy. Copy cannot create desire for a product. It can only take the hopes, dreams, fears and desires that already exist in the hearts of millions of people, and focus those already-existing desires onto a particular product."
> — Schwartz, Chapter 1

Every copy problem — a dead headline, a flat VSL, an ad that won't convert, a saturated market — reduces to **three diagnostic questions**. You ask these three questions *before* you write a single word.

## The three questions (do this FIRST, every time)

1. **What is the mass desire that creates this market?**
   Which pre-existing hope, fear, or craving is so strong that people are already reaching for a solution? (You do not invent it. You detect it.)

2. **What is your prospect's State of Awareness?**
   How much does this market already know about the product, the solution, and even that a problem exists?

3. **What is your prospect's State of Sophistication?**
   How many similar claims have they been exposed to already?

The answer to (1) gives you the **force**. The answers to (2) and (3) give you the **angle**. Skip any of the three and you are writing from taste instead of strategy.

## When to use this skill

- About to write any headline, subject line, hook, VSL lead, ad primary text, or sales-page above-the-fold.
- Reviewing copy that the user, a client, or a freelancer produced and deciding what's wrong with it.
- A product that used to convert is slipping — sales curve bending down.
- A market is crowded with near-identical offers and the current ad is drowning.
- Deciding angle, mechanism, or positioning for a new product launch.
- Writing briefs, audience maps, or creative plans for a performance campaign (Meta, Google, TikTok, YouTube).
- Auditing a funnel where something is clearly broken but the user can't articulate what.

## When NOT to use this skill

- Brand-building / awareness work where response is not measurable (BA is direct-response).
- UX copy, product microcopy, documentation, legal disclaimers.
- Pure storytelling where persuasion is not the goal.

## The diagnostic workflow

```
1. Name the mass desire (1 sentence). Is it a Permanent Force (instinct, chronic
   problem) or a Force of Change (trend, style, technological shift)? → mass-desire.md
2. Locate the market on the Awareness scale (1–5). → awareness-states.md
3. Locate the market on the Sophistication scale (1–5). → sophistication-stages.md
4. Cross-reference in the decision table below to decide what the headline
   should LEAD WITH and what it must AVOID.
5. Choose a headline operation from the 38. → headline-operations.md
6. If writing body copy, pick the technique(s) that match the job. → techniques.
7. Before shipping, run the review checklist. → review-checklist.md
```

## Decision table — what your headline should do

This is the practical output of combining Awareness × Sophistication. Use it as a first pass, then sharpen.

| Awareness | Sophistication | Headline leads with | Must avoid |
|---|---|---|---|
| 1. Most Aware | any | Product name + bargain price | Anything creative (it's a discount job, not a copy job) |
| 2. Product Aware | Stage 1–2 (fresh claim) | The product + its superiority | Ignoring competitors' claims |
| 2. Product Aware | Stage 3–4 (saturated) | A **new mechanism** that makes the old promise believable again | Repeating a worn-out claim |
| 2. Product Aware | Stage 5 (exhausted) | Identification — echo an emotion/attitude of the user | Mentioning product, price, or direct promise |
| 3. Solution Aware | Stage 1–2 | The desire/solution, product underneath | Naming your product in the headline |
| 3. Solution Aware | Stage 3–4 | Solution + new mechanism differentiator | Straight "get X benefit" phrasing |
| 4. Problem Aware | any | Name the problem, crystallize it, then promise solution | Jumping to product before dramatizing problem |
| 5. Unaware | any | Identification — tell them who they are; do NOT mention price, product, function, or desire | Any direct claim or price |

**Iron rule:** "A headline which works to a market in one stage of awareness will not work to a market in another stage of awareness. Nor will it work, even to a market in which it has been successful, once that market passes on to a new stage of awareness." (Schwartz, Ch. 2)

## The 38 headline operations (quick index)

When you have the angle but need to sharpen the verbalization, pick an operation. Full verbatim list with Schwartz's examples in `headline-operations.md`.

| # | Operation | # | Operation |
|---|---|---|---|
| 1 | Measure the size of the claim | 20 | Condense by interchanging product and what it replaces |
| 2 | Measure the speed of the claim | 21 | Symbolize with a parallel reality |
| 3 | Compare the claim | 22 | Connect mechanism to claim |
| 4 | Metaphorize the claim | 23 | Contradict the expected mechanism |
| 5 | Sensitize (sight/taste/touch/smell/sound) | 24 | Connect need and claim |
| 6 | Demonstrate with a prime example | 25 | Offer information in the ad itself |
| 7 | Dramatize the claim or its result | 26 | Turn claim/need into a case history |
| 8 | State the claim as a paradox | 27 | Give a name to the problem or need |
| 9 | Remove limitations from the claim | 28 | Warn about pitfalls of not using it |
| 10 | Associate with aspirational people/values | 29 | Emphasize by phraseology (break/repeat) |
| 11 | Show how much work in detail | 30 | Show ease by imposing an overcome limitation |
| 12 | State the claim as a question | 31 | State the difference in the headline |
| 13 | Offer information on how to accomplish it | 32 | Surprise that former limitations are gone |
| 14 | Tie authority into the claim | 33 | Address people who CAN'T buy it |
| 15 | Before-and-after the claim | 34 | Address your prospect directly |
| 16 | Stress the newness | 35 | Dramatize how hard it was to produce |
| 17 | Stress the exclusivity | 36 | Accuse the claim of being too good |
| 18 | Turn the claim into a challenge | 37 | Challenge the prospect's limiting beliefs |
| 19 | State as a case-history quotation | 38 | Turn the claim into Q&A |

## The 7 body copy techniques

Once the headline stops the prospect, the body copy has to sell. Schwartz's 7 techniques for body copy (Part II of the book). Brief usage guide in `techniques-quick-ref.md`:

1. **Intensification** — expand and sharpen desire. Paint the world of fulfillment in vivid scenes.
2. **Identification** — let the prospect see themselves in the role the product confers (status, belonging, self-image).
3. **Gradualization** — lead the prospect step-by-step from where they are now to where the product takes them, so each step feels inevitable.
4. **Redefinition** — reframe the existing beliefs or language around the product so objections collapse.
5. **Mechanization** — prove the claim through a concrete mechanism (how it works, why it can't fail).
6. **Concentration** — focus every element of the ad on a single dominant theme; subordinate everything else.
7. **Camouflage** — hide the sell behind something the prospect actually wants to read (a story, a news item, a guide).

## Three levels of creativity (and why to refuse the first two)

Schwartz, Chapter 5:

1. **Word-Substitute** (shallowest, most common, doesn't work) — pull someone else's headline, swap in your product. Produces "Echo Ads." Ignores the unique product-market-timing relationship.
2. **Formula** — memorize rules and pour the headline into a mold. Valid for verbalization (Chapter 4's 38 operations) but not for conception.
3. **Analytical** — no formulas, only guideposts and questions. Dig the idea out of the specific market × product × moment. **This is the only level that produces breakthroughs.**

> "What you are looking for in this product and this market is the one element that makes them unique. The idea you want — the headline you want — the breakthrough you want — are all wrapped up inside that product and that market. Nowhere else."

**Consequence for how to use this skill:** never propose copy by pattern-matching against a past winner. Always run the three questions first.

## Red flags — stop and re-diagnose

Stop writing and go back to the three questions if you catch yourself:

- Reaching for a headline formula before you've located the market on awareness × sophistication.
- Copying the structure of a past winning ad "because it worked before."
- Writing a direct claim to a Stage 4–5 sophisticated market (they're immune; you need new mechanism or identification).
- Naming the product in the headline of an Unaware market.
- Trying to *create* a desire instead of *channeling* one.
- Using the word "educate" about your prospects. Schwartz: "When advertising tries to create desire, it is no longer advertising but education. And, as education, it can produce at best only one dollar in sales for every dollar spent."
- Feeling clever. Cleverness is the enemy of the mass desire you're supposed to be surfing.

## Common mistakes

| Mistake | Why it's wrong | Fix |
|---|---|---|
| Writing the headline first | Headline is the *output* of the three questions, not the starting point | Answer the 3 questions first |
| Treating awareness and sophistication as one thing | They are orthogonal. A Product-Aware market can be Stage 1 or Stage 5 | Plot them on separate axes |
| Picking a headline operation before choosing the angle | Operations are verbalization tools; they don't decide what to say | Conception → verbalization → operation |
| Adding "new mechanism" to an already-claim-saturated market without making it believable | New mechanism only works if it's accepted as believable and significant by the market | Ground the mechanism in a specific, concrete, testable detail |
| Ignoring the "restorative power" of the market | Mature markets recycle: old customers become dissatisfied and re-enter. The desire never fades, only the claims go stale | Don't declare a market "dead" before checking if the claim is dead, not the desire |
| Giving feedback on copy as taste ("I like this") | Schwartz feedback is structural: awareness/sophistication mismatch, weak mass desire, wrong operation | Use the review checklist |

## Reference files (read on demand, not by default)

- `awareness-states.md` — the 5 states with Schwartz's verbatim descriptions and the headline tasks for each
- `sophistication-stages.md` — the 5 stages with the cigarette industry worked example
- `mass-desire.md` — the 3 dimensions (urgency, staying power, scope), Permanent Forces vs Forces of Change
- `headline-operations.md` — all 38 verbatim with original examples
- `review-checklist.md` — applied audit questions for reviewing existing copy (use when the user asks "what's wrong with this headline/ad/VSL")

## Output format when invoked as /ba

When the user invokes `/ba` on a piece of copy or a copy problem, return a structured response:

```
## Mass desire
<1 sentence — the pre-existing force you're channeling>

## Awareness level
<1–5, with justification from the market's language and behavior>

## Sophistication stage
<1–5, with justification from the competitive landscape>

## Diagnosis
<what's wrong, or what the biggest lever is, given the above>

## Recommended angle
<what the headline / lead should LEAD WITH, what it must AVOID>

## Headline operations to try
<3–5 operations from the 38 that match the angle, with one sample headline each>

## Next move
<the single most important thing the user should do next>
```

Keep the output in the user's working language (Portuguese for Yuri; verbatim Schwartz quotes and sample headlines stay in English because the source is English and the Persimmon market is US).

## Source

Eugene M. Schwartz, *Breakthrough Advertising* (1966, reissued by Boardroom 2004). All verbatim quotes in this skill and reference files are cited to chapter. PDF reference on Yuri's machine: `~/Downloads/breakthrough-advertising.pdf`.
