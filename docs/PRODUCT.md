# NYC 311 Priority Atlas

## One-sentence definition

NYC 311 Priority Atlas is an explorer-first urban-service intelligence workspace that lets users investigate complaint demand, recorded administrative closure, neighborhood context, prioritization assumptions, and the aging of historical request cohorts across New York City census tracts, with Claude as an optional interpretation layer.

## Core experience

### Explore and compare

- Open directly onto a tract-level NYC map.
- Switch among five service domains.
- Map complaint counts, complaints per 1,000 residents, income, closure timing, and historical workload indicators.
- Select up to five tracts.
- Compare population, income, complaint composition, top complaint types, and recorded closure.
- Expand a tract into a 1–5-hop Queen-contiguity neighborhood.
- Compare a tract with the neighborhood median while the rest of the city enters ghost mode.

### Scenario Lab

Test 550 validated scenarios across two scoring philosophies, five domains, five portfolio sizes, and eleven complaint-intensity versus lower-income settings.

### Workload

Replay actual 2016 arrival periods, request aging, recorded closure, open workload, net open change, age composition, and uncertainty. Then alter demand and closure assumptions in a clearly labeled scenario.

### Claude

Claude translates language into supported controls, explains deterministic outputs, compares places and scenarios, and generates evidence-grounded hypotheses. It cannot alter calculations or invent results.

## Sparse-sample rule

All 10,835 tract-domain records remain present.

Tract-specific closure, replay, and uncertainty require at least 30 known timing outcomes. Zero requests, no known timing, and insufficient sample are separate states. Missing closure evidence is never converted to zero.

Explicitly selected groups may pool counts. A pooled result is shown only when the combined known timing sample reaches 30.

## What the product cannot claim

- current NYC conditions;
- physical resolution from recorded closure;
- causal intervention effects;
- guaranteed demand reductions;
- full agency backlog;
- staffing or budget allocation;
- one objectively best scenario;
- precise tract-specific response from sparse data.

## Why it is more than a map

The project combines approximately 2.19 million tract-matched requests, demographics, complaint-type analysis, graph-based spatial exploration, closure cohorts, sensitivity analysis, 550 scenarios, age-structured workload replay, uncertainty, artifact validation, and bounded language-model delegation.
