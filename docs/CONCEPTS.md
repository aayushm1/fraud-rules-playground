# Fraud & Risk Concepts: A Field Guide for Fintech PMs

> Companion to the [Fraud Rules Playground](../README.md). Everything a product manager needs to discuss payments fraud with risk teams, engineers, and fintech interviewers, explained in plain language with examples from the prototype.

**Contents**

1. [Why fraud is a product problem](#1-why-fraud-is-a-product-problem)
2. [The payment journey & where fraud happens](#2-the-payment-journey--where-fraud-happens)
3. [Types of fraud](#3-types-of-fraud)
4. [Fraud signals](#4-fraud-signals)
5. [Rules vs machine learning](#5-rules-vs-machine-learning)
6. [Risk scoring & decisions](#6-risk-scoring--decisions)
7. [Measuring fraud systems: the metrics](#7-measuring-fraud-systems-the-metrics)
8. [The economics: pricing the trade-off](#8-the-economics-pricing-the-trade-off)
9. [Testing rules safely](#9-testing-rules-safely)
10. [Data pitfalls](#10-data-pitfalls)
11. [India context: UPI, RBI & the ecosystem](#11-india-context-upi-rbi--the-ecosystem)
12. [Operating a fraud function](#12-operating-a-fraud-function)
13. [Interview questions with model answers](#13-interview-questions-with-model-answers)
14. [Glossary](#14-glossary)

---

## 1. Why fraud is a product problem

Fraud prevention is a **balance between two kinds of error**:

| Error | Technical name | Business cost | Who complains |
|---|---|---|---|
| Fraud gets through | False negative | Lost money, chargeback fees, network penalties, regulatory risk | Finance, risk, regulators |
| Good customer blocked | False positive / **false decline** | Lost sale, angry customer, churn, merchant escalation | Customers, merchants, growth |

You cannot drive both to zero. Every control moves you along a **trade-off curve**. The PM's job is to:

1. **Make the trade-off visible**, e.g. with the trade-off curve in the playground.
2. **Price it in one unit** (rupees), so risk and growth teams can agree.
3. **Move the whole curve**, not just the point on it, using better signals, smarter friction and faster feedback loops.

> 💡 **Interview line:** "Fraud prevention isn't about stopping all fraud. It's about minimising the *total cost of fraud*: losses plus false declines plus operational cost."

---

## 2. The payment journey & where fraud happens

```
Onboarding ─► Login ─► Add payee / card ─► Initiate payment ─► Authorise ─► Settle ─► Dispute / chargeback
   (KYC)      (auth)     (beneficiary)       (risk check)      (issuer)    (T+1)       (days to months later)
```

| Stage | Typical fraud | Typical controls |
|---|---|---|
| Onboarding | Synthetic / stolen identities, mule accounts | KYC, document & liveness checks, device checks, consortium databases |
| Login | Account takeover via phishing / SIM swap | Device binding, step-up auth, behavioural biometrics |
| Add payee | Scam beneficiaries, mule accounts | Cooling-off periods, payee risk scores, name-match confirmation |
| Payment | Card testing, stolen cards, scams | **Real-time risk rules / models**, which is what the playground simulates |
| Post-payment | Friendly fraud, refund abuse | Dispute evidence, chargeback management |

**Key actors in a card payment:** cardholder → merchant → **acquirer** (merchant's bank / payment aggregator) → **card network** (Visa, Mastercard, RuPay) → **issuer** (cardholder's bank). In UPI: payer app (PSP) → payer bank → **NPCI** switch → payee bank → payee app.

---

## 3. Types of fraud

### Third-party fraud (someone pretending to be the customer)

| Type | How it works | Signals | In the playground |
|---|---|---|---|
| **Account takeover (ATO)** | Fraudster gets credentials via phishing, malware, SIM swap or a leaked password, then drains the account | New device, failed logins/OTPs, location change, password reset just before payment | ✅ 35% of fraud |
| **Card-not-present (CNP) fraud** | Stolen card details used online | New device, mismatched billing / IP, high-risk merchant | Partly (ATO + card testing) |
| **Card testing** | Bots try many tiny payments to find which stolen cards work | Velocity bursts, tiny amounts, high decline ratio, odd hours | ✅ 20% |
| **Synthetic identity** | A "person" built from mixed real and fake data opens an account, builds trust, then "busts out" | Very new account, thin history, shared device/phone across accounts | ✅ 25% |

### First-party & authorised fraud (the real customer is involved)

| Type | How it works | Why it's hard |
|---|---|---|
| **Social-engineering / APP scam** (authorised push payment) | The real customer is tricked into sending money ("KYC expired", fake investment, "digital arrest", job scams) | The **genuine user** on their **own device** authorises it, so most signals look normal. ✅ 20% in the playground, and the hardest to catch. |
| **Friendly fraud** | Customer makes a purchase, then disputes it as "not me" | The payment was legitimate, so the fight happens in dispute evidence |
| **Bust-out / credit fraud** | Borrower maxes out credit with no intent to repay | Looks like a good customer until it isn't |
| **Promo / refund abuse** | Multiple accounts farm cashback, or fake "item not received" claims | Device and identity linking across accounts |

### Money-movement fraud

| Type | Description |
|---|---|
| **Money mules** | Accounts (often rented or recruited) used to receive and pass on stolen funds |
| **Money laundering** | Placement → layering → integration of illicit funds. Handled by **AML** (anti-money laundering) transaction monitoring |
| **Merchant fraud** | Fake merchants processing stolen cards, or "transaction laundering" through a front business |

> **Fraud vs AML:** fraud prevention stops *losses to you or your customer*, in real time. AML detects *illicit money flows* for regulatory reporting (e.g. to India's FIU-IND), often after the fact. They share data and tooling but have different goals and regulators.

---

## 4. Fraud signals

| Family | Examples | Playground rule |
|---|---|---|
| **Velocity** | Payments per user / card / device / IP in the last 1h, 24h; amount summed per window | Velocity spike |
| **Authentication** | Failed PIN/OTP attempts, recent password or phone-number change, SIM swap flags | Failed authentication |
| **Device** | Device age, emulator/rooted device, number of accounts per device, device fingerprint | New device |
| **Identity / account** | Account age, KYC level, email/phone age, name match with payee | New account |
| **Behaviour** | First-time payee, unusual amount for *this* user, typing speed, session length (behavioural biometrics) | Large payment to new payee |
| **Location / network** | IP vs usual city, VPN/proxy/TOR, impossible travel, international | Location mismatch, International |
| **Transaction** | Amount, merchant category (MCC), time of day, channel | High amount, High-risk category, Odd hours |
| **Network / consortium** | Payee flagged by other banks, mule-account lists, shared devices across fraud cases | *(roadmap)* |

**Signal quality = precision × coverage.** A great signal fires rarely on good users (high precision) and catches a meaningful share of fraud (coverage). In the playground, *large payment to new payee* has 45.6% precision (27.8× lift) while *new account* has 4.5% (2.7× lift).

---

## 5. Rules vs machine learning

| | Rules | Machine-learning models |
|---|---|---|
| How | Human-written logic: `IF velocity ≥ 5 THEN +45 points` | Model learns patterns from labelled history, outputs a probability |
| Strengths | Transparent, instant to change, good for **known patterns and emergencies** | Finds subtle multi-signal patterns, adapts with retraining, usually more accurate |
| Weaknesses | Brittle, pile up over time, fraudsters learn the thresholds | Needs labelled data and ML infrastructure; harder to explain; can drift |
| Change speed | Minutes to hours | Weeks (retrain, validate, deploy) |
| Best for | Hot-fixes, policy and regulatory constraints, new products with no data | Core risk scoring at scale |

**What mature teams do:** a *layered* system. An ML score is the backbone, rules handle policy and emergencies, and an analyst review queue sits in the uncertain band. The ML score often enters the rules engine as **one weighted signal** (see the Roadmap). Rules don't go away; they become the control layer.

---

## 6. Risk scoring & decisions

### Points-based scoring (what the playground uses)
Each rule that fires adds risk points. The total score maps to a decision:

| Score band | Decision | Customer experience |
|---|---|---|
| `score < review` | **Allow** | Seamless |
| `review ≤ score < block` | **Review** (or **step-up**) | Held for an analyst, or asked for extra authentication |
| `score ≥ block` | **Block** | Declined |

**Why points beat "any rule blocks":** legacy systems often treat every rule as a hard block. One weak signal (e.g. paying at 1 AM) then declines a genuine customer. With points, weak signals only matter when they **stack up**.

### The decision toolkit (not just allow/block)
- **Step-up authentication**: ask for OTP, biometric, or a 3-D Secure challenge only when risk is elevated. It adds friction in exchange for confidence, and is often better than a decline.
- **Hold / delay**: e.g. a cooling-off period for first payments to a new payee.
- **Limit**: allow, but cap the amount.
- **Warn**: show an in-app scam warning ("Do you know this person? Banks never ask you to…"). This is especially effective against social-engineering scams.
- **Manual review**: analyst checks and calls the customer.

---

## 7. Measuring fraud systems: the metrics

### The confusion matrix

| | Actually fraud | Actually genuine |
|---|---|---|
| **Flagged / blocked** | True positive (TP): fraud caught ✅ | False positive (FP): **false decline** ❌ |
| **Allowed** | False negative (FN): fraud missed ❌ | True negative (TN): happy customer ✅ |

### Core metrics

| Metric | Formula | Plain meaning | Playground (tuned) |
|---|---|---|---|
| **Recall / detection rate** | TP ÷ (TP + FN) | Share of fraud we catch | 82.1% |
| **Value detection rate** | ₹ fraud caught ÷ ₹ total fraud | Recall weighted by money, often what finance cares about | 86.8% |
| **Precision** | TP ÷ (TP + FP) | When we act, how often we're right | per rule in table |
| **False-positive rate / false-decline rate** | FP ÷ (FP + TN) | Share of genuine customers we hurt | 0.56% |
| **Good customers blocked per fraud stopped** | FP ÷ TP | Very intuitive for executives | 0.6 (legacy: 10.2) |
| **Lift** | Precision ÷ base fraud rate | How much better than random a rule is | 27.8× for best rule |
| **Approval rate** | Approved ÷ attempted | The growth team's headline metric | 97.8% |
| **Fraud rate (bps)** | ₹ fraud ÷ ₹ total volume × 10,000 | Industry-standard loss rate, quoted in basis points | — |
| **Chargeback ratio** | Chargebacks ÷ transactions (monthly) | Card networks monitor merchants above set thresholds | — |
| **Review rate & SLA** | Reviews ÷ transactions; time to decision | Ops capacity and customer wait | ≈13/day |

> ⚠️ **Base-rate trap:** with fraud at 0.1%, a model that approves *everything* is "99.9% accurate". Never use accuracy for fraud. Use precision, recall and cost.

### The trade-off curve
Sweeping the threshold from strict to loose traces a curve of *fraud caught* vs *good customers hit*. This is the playground's version of an **ROC curve**. A better rule set **shifts the whole curve up and to the left**; tuning a threshold just **moves along** it. Product strategy is about both.

---

## 8. The economics: pricing the trade-off

```
Total cost of fraud = Fraud losses + False-decline cost + Operational cost

Fraud losses       = ₹ fraud allowed + chargeback fees (+ network penalties)
False-decline cost = ₹ good payments declined × (lost margin + lifetime-value churn)
Operational cost   = manual reviews × cost per review (+ customer-support contacts)
```

**Why one number matters:** it turns *"risk wants tighter rules, growth wants looser ones"* into one optimisation problem that everyone can debate with data. In the playground, the **Lock-down** preset cuts fraud losses to ₹0.86 L but blocks 1,274 good customers. Its total cost (₹28 L) is far worse than **Tuned** (₹5.8 L).

**Who bears the loss** depends on the rail and the regulation:
- Card fraud with no authentication: usually the merchant or acquirer through chargebacks. With strong authentication (3-D Secure), liability often shifts to the issuer.
- Unauthorised electronic transactions in India: RBI's customer-liability framework limits what customers lose when they report quickly, so banks bear much of the cost.
- Authorised scams: historically mostly the customer. Several regulators worldwide (e.g. the UK's 2024 APP reimbursement rules) now push more liability onto payment firms, which raises the stakes for PMs.

---

## 9. Testing rules safely

| Technique | What it is | Risk to customers |
|---|---|---|
| **Back-testing** | Replay a candidate rule on labelled historical data (what the playground does) | None |
| **Shadow mode** | Run the rule live and log what it *would* have done, without acting | None |
| **Champion / challenger** | Route a small % of traffic to the new rule set and compare outcomes | Small, controlled |
| **Staged rollout** | 5% → 25% → 100% with guardrail alerts | Controlled |
| **Rule review & retirement** | Quarterly audit of precision/lift per rule; retire or re-weight noisy ones | Reduces false declines |
| **Maker-checker** | One person proposes a rule, another approves it, with an audit log | Governance |

---

## 10. Data pitfalls

1. **Label delay:** fraud is often confirmed only when a chargeback or complaint arrives, weeks or months later. Recent data looks cleaner than it is, so back-test on **matured** windows.
2. **Selection bias:** you never learn whether a *blocked* payment was actually fraud. Mature teams keep a small **random hold-out** (allow a tiny sample with limits) to measure true performance.
3. **Adversarial drift:** fraudsters adapt. A rule like "≥ 5 payments in 1h" teaches bots to send 4. Rules decay, so monitor them.
4. **Class imbalance:** fraud is rare (often well under 1%). Small absolute changes matter, and metrics need care.
5. **Feedback loops:** a model trained only on what you allowed inherits your past blind spots.
6. **Seasonality:** festive sales, salary days and IPO days shift normal behaviour. Re-baseline your thresholds.

---

## 11. India context: UPI, RBI & the ecosystem

> Regulations change often. Verify specifics against current RBI / NPCI publications before quoting them in an interview.

- **UPI** dominates Indian retail digital payments by volume. Payments are real-time and irrevocable, so prevention must happen **before** the payment. Scam typologies (fake KYC calls, collect-request scams, investment and job scams, "digital arrest") are major concerns.
- **NPCI** operates UPI, RuPay and other rails, and sets ecosystem-level risk controls (e.g. limits, and restrictions on certain request types).
- **RBI** regulates banks and payment aggregators. Key themes for PMs:
  - **Customer liability for unauthorised transactions**: customers who report quickly have limited or zero liability, so the bank bears the loss and fraud controls become a P&L issue.
  - **Strong authentication**: an additional factor of authentication for card-not-present payments, plus an ongoing move toward **risk-based authentication** beyond SMS OTP.
  - **Payment aggregator guidelines**: merchant due diligence (KYC of merchants) and monitoring obligations.
  - **Fraud reporting & classification** requirements for regulated entities.
- **Ecosystem initiatives:** national cybercrime reporting (the **1930** helpline and the cybercrime portal) and RBI Innovation Hub's work on AI-based **mule-account detection**.
- **Account Aggregator (AA)** framework: consent-based financial data sharing, which is useful for identity and cash-flow risk signals.
- **DPDP Act 2023**: India's data-protection law. Fraud signals (device data, location, behaviour) must be collected and processed lawfully, with a clear purpose.

---

## 12. Operating a fraud function

| Role | Cares about |
|---|---|
| **Risk / fraud analyst** | Review queue, investigating cases, writing rules |
| **Risk operations lead** | Losses, false declines, team capacity, SLAs |
| **Data scientist** | Models, features, label quality |
| **Compliance / AML** | Regulatory obligations, reporting, audit trails |
| **Product / growth** | Conversion, approval rate, customer experience |
| **Customer support** | Declined-payment complaints, scam victims |
| **Merchant success** (for PAs) | Merchant escalations about declines and chargebacks |

**A healthy weekly rhythm:** loss and false-decline dashboard → top missed-fraud case review → rule performance review (retire, re-weight) → change requests through maker-checker → shadow-test → ship.

---

## 13. Interview questions with model answers

**Q1. Fraud losses rose 30% last month. Leadership wants to tighten rules. What do you do?**
> First, diagnose before acting. Is the rise in *count* or *value*? Is it one typology (e.g. a scam wave), one merchant, or one channel? Is it a real increase or label timing (a chargeback backlog)? Then size the fix on the trade-off curve: a targeted rule on the new pattern (e.g. velocity on one merchant category) usually beats a global threshold cut. Back-test it, shadow it for a few days, and roll it out with a guardrail on false-decline rate. Report the change in *total cost*, not just losses.

**Q2. How would you measure the success of a fraud product?**
> North Star: total cost of fraud. Supporting metrics: detection rate (count and value), false-decline rate, approval rate, review rate and SLA, and good customers blocked per fraud stopped. Guardrails: no fraud typology gets worse, and the review queue stays within capacity.

**Q3. Rules or ML?**
> Both, in layers. ML for the core score because it's more accurate on multi-signal patterns. Rules for policy, emergencies and new products with no data. The ML score becomes one input to the rules engine, so decisions stay explainable and quickly adjustable.

**Q4. A merchant complains their good customers are being declined. How do you investigate?**
> Pull that merchant's declines. Check which rules fired and their precision for this merchant's segment. Often a global rule (e.g. "high amount") misfires on a merchant with high ticket sizes. The fix is a segment-specific threshold or a lower weight, validated by back-test.

**Q5. How do you stop UPI scams where the real user authorises the payment?**
> Transaction rules alone hit a ceiling (the playground catches about 60%). Add payee-side intelligence: mule-account scores, payee age, and reports from other banks. Add *contextual friction*: a cooling-off period or a warning for large first payments to new payees, and a "were you asked to pay by someone on a call?" interstitial. Measure scam rate per 10,000 payments and complaint volume.

**Q6. What's wrong with measuring fraud models by accuracy?**
> Class imbalance. At 0.1% fraud, approving everything is 99.9% accurate. Use precision, recall, false-positive rate and cost.

**Q7. How do you know a blocked payment was actually fraud?**
> You often don't. That's selection bias. Use a small random hold-out, use customer confirmation on step-up challenges, and accept that back-tests on blocked traffic are estimates.

---

## 14. Glossary

| Term | Meaning |
|---|---|
| **3-D Secure (3DS)** | Card authentication protocol (e.g. OTP / app approval) for online payments; can shift liability to the issuer |
| **Acquirer** | Bank or processor that accepts card payments on behalf of a merchant |
| **AML** | Anti-money laundering: detecting and reporting illicit fund flows |
| **APP fraud** | Authorised push payment fraud: the victim is tricked into sending money |
| **ATO** | Account takeover |
| **Basis point (bps)** | 0.01%. Fraud loss rates are often quoted in bps of volume |
| **Bust-out** | Building credit or trust, then maxing out and disappearing |
| **Champion / challenger** | Comparing the current strategy with a candidate on split traffic |
| **Chargeback** | A card payment reversed via the network after a dispute; costs the merchant the amount plus fees |
| **Consortium data** | Shared fraud intelligence across institutions |
| **Device fingerprint** | Identifier built from device attributes to recognise repeat devices |
| **False decline** | A genuine payment wrongly declined |
| **FIU-IND** | Financial Intelligence Unit, India's AML reporting body |
| **Friendly fraud** | A genuine customer disputing a legitimate payment |
| **Issuer** | The cardholder's bank |
| **KYC / KYB** | Know your customer / know your business: identity verification |
| **Lift** | How many times more likely a flagged item is fraud vs the average |
| **MCC** | Merchant category code |
| **Money mule** | Account used to receive and move stolen funds |
| **NPCI** | National Payments Corporation of India, which operates UPI and RuPay |
| **PA / PG** | Payment aggregator / payment gateway |
| **Precision / recall** | Correctness of flags / share of fraud caught |
| **Shadow mode** | Running a rule live without acting on its decisions |
| **Step-up authentication** | Asking for extra verification only when risk is elevated |
| **Synthetic identity** | A fabricated identity combining real and fake data |
| **Velocity check** | Counting events (payments, logins) per entity per time window |
