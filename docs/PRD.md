# PRD: Fraud Rules Playground (v1)

| | |
|---|---|
| **Author** | Aayush Mehan (Product) |
| **Status** | v1 prototype shipped · v2 (shadow mode) in discovery |
| **Company** | Kavach Pay *(fictional payments company, used for this case study)* |
| **Stakeholders** | Risk Ops, Data Science, Engineering (Payments Platform), Compliance, Merchant Success, Growth |
| **Last updated** | October 2026 |

---

## 1. Background

Kavach Pay processes UPI, card and netbanking payments for consumers and merchants. Fraud is controlled by a legacy rule set: **five hard-block rules** written over several years, maintained in code by the payments platform team.

Signals from the business:
- Merchant escalations about declined genuine customers are rising, especially from electronics and travel merchants.
- Fraud losses haven't improved despite rules being added.
- Each rule change needs an engineering ticket. Median time to change a threshold is about **3 weeks**.
- No dashboard shows how each rule performs.

## 2. Problem statement

> Risk teams cannot see or test the trade-off between catching fraud and blocking genuine customers before shipping a rule. So they ship blunt rules slowly, which costs money on both sides.

### Evidence (from the back-test of the legacy rules on 30 days of labelled data)
- Legacy rules catch **36.6%** of fraud (62.4% by value).
- They block **609 genuine customers a month** (6.2% false-decline rate), or **10.2 good customers per fraud stopped**.
- Total cost of fraud: **₹35.5 L/month**, of which **₹25.3 L** is the cost of false declines. *Over-blocking costs more than the fraud itself.*

## 3. Goals & non-goals

### Goals
1. Let risk analysts **create, tune and back-test** rules without engineering.
2. Make the **fraud vs customer-experience trade-off** visible and priced in rupees.
3. Show **per-rule performance** so noisy rules can be retired.
4. Make every decision **explainable** (which rules fired, with how many points).

### Non-goals (v1)
- Deploying rules to production (v1 outputs a reviewable JSON config).
- Training ML models.
- Case management / investigation tooling.
- Real-time streaming data (v1 uses a labelled 30-day snapshot).

## 4. Users

| Persona | Need | Frequency |
|---|---|---|
| **Risk Ops Lead (primary)** | Tune rules during attacks and quarterly reviews; justify trade-offs to leadership | Weekly, plus incidents |
| **Fraud Analyst** | Understand why payments were flagged; propose new rules | Daily |
| **Growth / Merchant Success** | See the cost of declines; argue for approvals with data | Monthly |
| **Compliance** | Audit trail of rule changes and decision reasons | Quarterly |

## 5. User stories

| # | As a… | I want to… | So that… | Priority |
|---|---|---|---|---|
| U1 | Risk lead | toggle rules and adjust thresholds and weights | I can design a rule set without an eng ticket | P0 |
| U2 | Risk lead | see fraud caught, false declines, review load and total cost update instantly | I know the impact before shipping | P0 |
| U3 | Risk lead | compare any configuration against the current (legacy) baseline | I can show the improvement | P0 |
| U4 | Analyst | see each rule's precision and lift | I can retire noisy rules | P0 |
| U5 | Analyst | inspect individual payments and the reasons they were flagged | I can explain decisions and spot missed patterns | P0 |
| U6 | Risk lead | send uncertain payments to manual review instead of blocking | I protect good customers without letting fraud through | P0 |
| U7 | Risk lead | start from presets (lock-down, growth mode) | I can react quickly to context | P1 |
| U8 | Finance | edit cost assumptions | the rupee numbers reflect our real economics | P1 |
| U9 | Risk lead | see catch rate by fraud typology | I find blind spots | P1 |
| U10 | Risk lead | export the configuration | it can go through change review | P1 |
| U11 | Risk lead | run a rule in shadow mode on live traffic | I validate it on fresh data | P2 (v2) |

## 6. Requirements

### Functional
- **FR1 Rule library:** 10 rules across velocity, authentication, device, account, behaviour, location and transaction signals. Each has on/off, a threshold (where applicable) and risk points (0–100).
- **FR2 Decisioning:** score = sum of points of the rules that fire. Two thresholds map the score to allow / review / block.
- **FR3 Metrics:** recall (count and ₹), fraud losses, false declines and rate, review volume and cost, approval rate, total cost, each shown as a delta vs legacy.
- **FR4 Trade-off curve:** fraud flagged vs good customers hit, across all thresholds, with current and legacy points marked.
- **FR5 Rule performance:** fires, fraud hits, good hits, precision, lift, and a verdict (Strong / Useful / Noisy).
- **FR6 Explorer:** filters (missed fraud, false declines, caught, review, flagged) showing reasons and points per payment.
- **FR7 Presets:** Legacy, Tuned, Lock-down, Growth mode. Any edit switches to "Custom".
- **FR8 Cost model:** editable chargeback fee, review cost, review catch rate, review abandonment, and false-decline cost per ₹.
- **FR9 Export:** copy the active configuration as JSON.

### Non-functional
- Re-scores 10,000 payments in **under 100 ms** on a mid-range laptop, so slider changes feel live.
- Deterministic data: the same seed gives the same results for every user, so numbers are reproducible.
- Zero backend and zero dependencies; hosted as static files.
- Accessible colour contrast; works on tablet widths and up.

## 7. Success metrics

| Metric | Target (90 days post-launch) |
|---|---|
| ⭐ Total cost of fraud | **−50%** vs legacy baseline |
| False-decline rate | **< 1%** |
| Fraud caught (count) | **≥ 75%**, with no typology worse than legacy |
| Review queue | ≤ 1 analyst's capacity (~40/day) |
| Rule changes shipped without eng | **≥ 80%** |
| Median time from rule idea to live | **< 2 days** (from ~3 weeks) |

**Back-test result of the recommended "Tuned" configuration:** −84% total cost, 0.56% false-decline rate, 82.1% fraud caught, ~13 reviews/day. All targets met.

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Back-test overfits historical fraud; real fraud adapts | Shadow mode + champion/challenger (v2); quarterly rule review |
| Label delay makes recent data look clean | Back-test only on windows older than 60 days |
| Selection bias (blocked payments have no label) | Small random hold-out with amount limits |
| Self-serve rules cause an accidental outage (block everything) | Guardrails: max false-decline delta per change; maker-checker approval |
| Cost assumptions disputed | Assumptions are editable and owned by Finance |
| Review queue overloads during attacks | Capacity alert; auto-escalate threshold; step-up auth instead of review |

## 9. Rollout plan

1. **v1 (done):** back-testing playground on a labelled snapshot; recommended config handed to engineering as JSON.
2. **v1.1:** Ship the tuned config behind a feature flag in **shadow mode** for 2 weeks; compare live shadow decisions against the back-test.
3. **v2:** Champion/challenger at 5% → 25% → 100%, with guardrails on false-decline rate and approval rate.
4. **v3:** Self-serve rule deployment with maker-checker approval and an audit log; step-up authentication as a decision type; ML score as a weighted signal.

## 10. Open questions

- Do we need per-merchant or per-segment thresholds in v2 (e.g. travel merchants have naturally high tickets)?
- Who owns the cost model: Finance or Risk?
- What's the right hold-out size to measure selection bias without material loss?
