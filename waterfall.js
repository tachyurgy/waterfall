// Distribution waterfall engine for closed-end private funds.
//
// The waterfall is the contractual order in which distributable cash is split
// between limited partners and the general partner. Getting the tier order and
// the catch-up arithmetic right is the whole job: a 1bp error on a $400M fund is
// a $40k misallocation, and LPs audit these to the penny.

// ---------------------------------------------------------------------------
// XIRR — money-weighted return over irregular dates, solved by Newton-Raphson
// with a bisection fallback because Newton diverges on sign-heavy cashflows.
// ---------------------------------------------------------------------------

const DAY = 86400000;

export function xnpv(rate, flows) {
  if (rate <= -1) return Infinity;
  const t0 = new Date(flows[0].date).getTime();
  return flows.reduce((s, f) => {
    const yrs = (new Date(f.date).getTime() - t0) / (365 * DAY);
    return s + f.amount / Math.pow(1 + rate, yrs);
  }, 0);
}

export function xirr(flows, guess = 0.1) {
  if (flows.length < 2) return null;
  const hasPos = flows.some((f) => f.amount > 0);
  const hasNeg = flows.some((f) => f.amount < 0);
  if (!hasPos || !hasNeg) return null;

  let rate = guess;
  for (let i = 0; i < 60; i++) {
    const f0 = xnpv(rate, flows);
    if (!isFinite(f0)) break;
    if (Math.abs(f0) < 1e-7) return rate;
    const d = (xnpv(rate + 1e-6, flows) - f0) / 1e-6;
    if (Math.abs(d) < 1e-12) break;
    const next = rate - f0 / d;
    if (!isFinite(next)) break;
    if (Math.abs(next - rate) < 1e-9) return next;
    rate = Math.max(next, -0.9999);
  }

  // Bisection fallback over a wide bracket.
  let lo = -0.9999, hi = 10;
  let flo = xnpv(lo, flows);
  for (let i = 0; i < 300; i++) {
    const mid = (lo + hi) / 2;
    const fm = xnpv(mid, flows);
    if (Math.abs(fm) < 1e-7) return mid;
    if ((flo < 0) !== (fm < 0)) { hi = mid; } else { lo = mid; flo = fm; }
  }
  return (lo + hi) / 2;
}

// ---------------------------------------------------------------------------
// Preferred return accrual. The hurdle compounds on unreturned capital, so the
// pref owed depends on *when* capital was called and when it came back — not on
// a flat percentage of commitments.
// ---------------------------------------------------------------------------

export function accruePreferred(contributions, distributions, hurdle, asOf, compounding = 'annual') {
  const events = [
    ...contributions.map((c) => ({ date: c.date, amount: c.amount, kind: 'call' })),
    ...distributions.map((d) => ({ date: d.date, amount: d.amount, kind: 'dist' })),
  ].sort((a, b) => new Date(a.date) - new Date(b.date));

  let unreturned = 0;
  let prefOutstanding = 0; // pref not yet paid — reduced by distributions
  let prefEarned = 0;      // cumulative pref the LPs became entitled to, never reduced
  let cursor = events.length ? new Date(events[0].date) : new Date(asOf);

  const accrueTo = (to) => {
    const yrs = (to - cursor) / (365 * DAY);
    if (yrs <= 0) return;
    // Pref compounds on capital still outstanding, plus unpaid pref if the LPA
    // compounds. Capital already returned stops earning a preferred return.
    const base = unreturned + (compounding === 'annual' ? prefOutstanding : 0);
    const accrual = base * (Math.pow(1 + hurdle, yrs) - 1);
    prefOutstanding += accrual;
    prefEarned += accrual;
    cursor = to;
  };

  for (const e of events) {
    accrueTo(new Date(e.date));
    if (e.kind === 'call') {
      unreturned += e.amount;
    } else {
      // Distributions retire outstanding pref first, then return capital.
      let cash = e.amount;
      const payPref = Math.min(cash, prefOutstanding);
      prefOutstanding -= payPref;
      cash -= payPref;
      const payCap = Math.min(cash, unreturned);
      unreturned -= payCap;
    }
  }
  accrueTo(new Date(asOf));

  // `preferredEarned` is the tier-2 entitlement for a since-inception waterfall
  // run over cumulative proceeds; `preferredOwed` is what is still unpaid today.
  return { unreturnedCapital: unreturned, preferredOwed: prefOutstanding, preferredEarned: prefEarned };
}

// ---------------------------------------------------------------------------
// The waterfall itself. Four tiers, applied in strict order until cash runs out.
//
//   1. Return of capital        — 100% LP until contributed capital is returned
//   2. Preferred return         — 100% LP until the hurdle is satisfied
//   3. GP catch-up              — `catchUpRate` to GP until GP holds `carry` of profit
//   4. Residual split           — carry / (1 - carry) between GP and LP
// ---------------------------------------------------------------------------

export function runWaterfall({ distributable, contributedCapital, preferredOwed, carry, catchUpRate, priorGpCarry = 0, priorProfitDist = 0 }) {
  let remaining = distributable;
  const tiers = [];
  let lpTotal = 0;
  let gpTotal = 0;

  // Tier 1 — return of capital
  const t1 = Math.min(remaining, contributedCapital);
  remaining -= t1;
  lpTotal += t1;
  tiers.push({ tier: 1, name: 'Return of capital', basis: `${fmtMoney(contributedCapital)} contributed`, lp: t1, gp: 0, remaining });

  // Tier 2 — preferred return
  const t2 = Math.min(remaining, preferredOwed);
  remaining -= t2;
  lpTotal += t2;
  tiers.push({ tier: 2, name: 'Preferred return', basis: `${fmtMoney(preferredOwed)} accrued`, lp: t2, gp: 0, remaining });

  // Tier 3 — GP catch-up.
  // Target: GP ends holding `carry` share of *cumulative profit distributions*.
  // Profit distributed so far in this waterfall = the pref paid (tier 2), plus
  // any profit distributed in prior periods.
  const profitSoFar = priorProfitDist + t2;
  // Solve: (priorGpCarry + x) / (profitSoFar + x) = carry  →  x = carry*profitSoFar - priorGpCarry
  //                                                             ────────────────────────────────
  //                                                                       1 - carry
  const catchUpTarget = Math.max(0, (carry * profitSoFar - priorGpCarry) / (1 - carry));
  // The GP receives catchUpRate of each dollar during catch-up, so the cash the
  // tier consumes is larger than the carry it delivers.
  const catchUpCash = catchUpRate > 0 ? Math.min(remaining, catchUpTarget / catchUpRate) : 0;
  const t3gp = catchUpCash * catchUpRate;
  const t3lp = catchUpCash - t3gp;
  remaining -= catchUpCash;
  lpTotal += t3lp;
  gpTotal += t3gp;
  tiers.push({
    tier: 3,
    name: `GP catch-up (${(catchUpRate * 100).toFixed(0)}%)`,
    basis: `target ${fmtMoney(catchUpTarget)} carry`,
    lp: t3lp, gp: t3gp, remaining,
  });

  // Tier 4 — residual split
  const t4gp = remaining * carry;
  const t4lp = remaining - t4gp;
  lpTotal += t4lp;
  gpTotal += t4gp;
  tiers.push({
    tier: 4,
    name: `Residual split (${((1 - carry) * 100).toFixed(0)}/${(carry * 100).toFixed(0)})`,
    basis: 'after catch-up',
    lp: t4lp, gp: t4gp, remaining: 0,
  });

  return { tiers, lpTotal, gpTotal, distributable };
}

// ---------------------------------------------------------------------------
// Fund-level roll-up. European waterfall runs one whole-fund waterfall; American
// runs it deal-by-deal, which pays the GP carry earlier and is why LPs push back
// on it in negotiation.
// ---------------------------------------------------------------------------

export function computeFund(fund, params, asOf) {
  const { hurdle, carry, catchUpRate, mode } = params;

  if (mode === 'european') {
    const contributed = fund.deals.reduce((s, d) => s + d.contributed, 0);
    const proceeds = fund.deals.reduce((s, d) => s + d.realized, 0);
    const calls = fund.deals.flatMap((d) => d.calls);
    const dists = fund.deals.flatMap((d) => d.dists);
    const { preferredEarned } = accruePreferred(calls, dists, hurdle, asOf);
    const wf = runWaterfall({
      distributable: proceeds,
      contributedCapital: contributed,
      preferredOwed: preferredEarned,
      carry,
      catchUpRate,
    });
    return { mode, waterfalls: [{ label: 'Whole fund', ...wf, contributed, preferredOwed: preferredEarned }], ...totals(wf) };
  }

  // American: each realized deal runs its own waterfall against only that deal's
  // capital, so early winners generate carry before later losers are known.
  const waterfalls = [];
  let priorGpCarry = 0;
  let priorProfitDist = 0;

  for (const d of fund.deals) {
    if (d.realized <= 0) continue;
    const { preferredEarned } = accruePreferred(d.calls, d.dists, hurdle, asOf);
    const wf = runWaterfall({
      distributable: d.realized,
      contributedCapital: d.contributed,
      preferredOwed: preferredEarned,
      carry,
      catchUpRate,
      priorGpCarry,
      priorProfitDist,
    });
    priorGpCarry += wf.gpTotal;
    priorProfitDist += Math.max(0, d.realized - d.contributed);
    waterfalls.push({ label: d.name, ...wf, contributed: d.contributed, preferredOwed: preferredEarned });
  }

  const agg = waterfalls.reduce(
    (a, w) => ({ tiers: [], lpTotal: a.lpTotal + w.lpTotal, gpTotal: a.gpTotal + w.gpTotal, distributable: a.distributable + w.distributable }),
    { tiers: [], lpTotal: 0, gpTotal: 0, distributable: 0 }
  );
  return { mode, waterfalls, ...totals(agg) };
}

function totals(wf) {
  return { lpTotal: wf.lpTotal, gpTotal: wf.gpTotal, distributable: wf.distributable };
}

// ---------------------------------------------------------------------------
// Per-LP allocation. Pro rata by commitment, but a side letter can carve an LP
// out of carry (common for anchor investors and fund-of-funds).
// ---------------------------------------------------------------------------

export function allocateToLPs(lps, lpTotal, gpTotal, contributedTotal) {
  const totalCommit = lps.reduce((s, l) => s + l.commitment, 0);
  let carryRebate = 0;

  const rows = lps.map((lp) => {
    const share = lp.commitment / totalCommit;
    let amount = lpTotal * share;
    // A reduced-carry side letter rebates that LP's pro-rata slice of GP carry.
    if (lp.carryOverride != null) {
      const standardCarrySlice = gpTotal * share;
      const rebate = standardCarrySlice * (1 - lp.carryOverride);
      amount += rebate;
      carryRebate += rebate;
    }
    return { ...lp, share, amount, contributed: contributedTotal * share };
  });
  return { rows, carryRebate, gpNet: gpTotal - carryRebate };
}

export function fmtMoney(n) {
  const a = Math.abs(n);
  if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'k';
  return '$' + n.toFixed(0);
}
