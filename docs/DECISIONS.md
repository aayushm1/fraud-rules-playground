# Decision Log

Key product decisions behind the Fraud Rules Playground, with the alternatives I considered and why I chose what I did.

---

### D1. Optimise for *total cost of fraud*, not fraud losses
- **Context:** Risk teams are usually measured on fraud losses, growth teams on approval rate. Each optimises its own metric at the other's expense.
- **Options:** (a) fraud losses, (b) approval rate, (c) a single rupee metric combining both plus operational cost.
- **Decision:** (c), **Total cost = fraud losses + false-decline cost + review cost.**
- **Why:** It's the only metric where *Lock-down* (₹28 L) correctly loses to *Tuned* (₹5.8 L), even though Lock-down has lower fraud losses. One number ends the risk-vs-growth argument.
- **Trade-off:** It depends on assumptions (e.g. the cost of a false decline), so I made every assumption **editable** and visible.

### D2. Points-based score instead of "any rule blocks"
- **Context:** Legacy rules hard-block on any single signal.
- **Options:** (a) keep hard blocks and tune thresholds, (b) AND/OR rule combinations, (c) weighted points + thresholds.
- **Decision:** (c).
- **Why:** Fraud shows up as *several weak signals together*. Points let weak signals (odd hours, international) add evidence without blocking on their own. That's how the false-decline rate fell from 6.2% to 0.56% while fraud caught rose. It's also easier for analysts to reason about than nested boolean logic.
- **Trade-off:** Weights need tuning. The trade-off curve and rule-performance table exist to make that tuning easy.

### D3. Add a manual-review band
- **Options:** binary allow/block vs allow/review/block.
- **Decision:** Three outcomes.
- **Why:** In the tuned set, 46 fraud payments sit in the review band. Raising the review threshold from 45 to 50 cuts fraud caught from 82% to 69%. About 13 reviews a day is cheap insurance for one analyst.
- **Trade-off:** Reviews cost ₹40 each and 8% of good customers abandon while waiting. Step-up authentication (roadmap) should replace most reviews.

### D4. Keep weak rules at low weight instead of deleting them
- **Observation:** *New account* (2.7× lift) and *International* (3.2×) are "noisy" on their own.
- **Decision:** Keep them at 10–25 points rather than remove them.
- **Why:** As hard blocks they are harmful. As low-weight evidence they push combined cases (e.g. new account + new device + new payee) over the threshold. The verdict column flags them so analysts can re-weight them consciously.

### D5. Synthetic, deterministic data
- **Options:** public Kaggle fraud datasets vs generated data.
- **Decision:** A seeded generator built around 4 Indian-payments fraud typologies.
- **Why:** Public datasets are anonymised (PCA features) or card-only, so they can't express UPI, new-payee or device signals, and the rules wouldn't be explainable. A fixed seed means every visitor sees identical numbers, and the README results are reproducible.
- **Trade-off:** It's illustrative. The fraud rate (1.6%) is deliberately higher than real-world rates so there are enough cases to analyse. The disclaimer says so.

### D6. Show typology-level results, including where rules fail
- **Decision:** Show catch rate by fraud type, and call out that scams stay around 60%.
- **Why:** Aggregate recall hides blind spots. Being honest about the limits of rules makes the roadmap credible (payee-risk intelligence, scam warnings) and is what a real risk leader would ask about first.

### D7. Zero-dependency static site
- **Decision:** Vanilla JS + hand-drawn SVG chart, no framework, no backend.
- **Why:** Free GitHub Pages hosting, instant load, nothing to maintain, and the engine runs in Node for reproducible reports. Re-scoring 10k payments per slider move is a few milliseconds.

### D8. Export config as JSON instead of "deploy"
- **Decision:** v1 ends at a reviewable JSON change request.
- **Why:** Letting analysts push rules straight to production without maker-checker is a governance risk. JSON lets the change go through code review today; self-serve deployment with approvals is v3.
