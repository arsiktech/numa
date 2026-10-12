# UX Core Flow Improvements

Last updated: 2026-07-08.

## Verdict

Numa's flow should reduce first-use hesitation: users need to know which surface
they picked, what to do first, and that recording money in Numa does not move
real money without an explicit settlement or confirmation.

## Bias Hypotheses

- Choice overload: three modes can feel like a product taxonomy instead of a
  decision. Each mode now states the first screen, first move, and safety
  promise.
- Ambiguity aversion: an empty money app can feel broken or judgmental. Simple
  Home now shows a "Start here" path when there are no real expenses or buckets.
- Loss aversion: shared expenses can feel risky if users think adding a split
  pays someone immediately. The shared setup copy now says the first expense is
  only a record until settlement.

## Shipped Interventions

- Onboarding Mode cards expose: first screen, first move, and safe-because.
- Simple Home empty state adds a focused first-use path: add one expense, make
  one bucket, or open Money to edit/delete.
- Settings mode switching repeats the first move per mode and frames switching
  as changing visible surfaces, not moving data.
- Shared Pot first expense guidance clarifies that money does not move until a
  settlement is recorded.

## Validation

- Quantitative: onboarding mode-step completion, first expense creation rate,
  first bucket creation rate, shared first expense creation, mode switch usage,
  support complaints about "wrong mode" or "did I pay someone?"
- Qualitative: ask new users what they expect to happen after tapping the first
  Add/Split action. The intervention backfires if users believe Numa has
  imported, connected, or paid anything automatically.
