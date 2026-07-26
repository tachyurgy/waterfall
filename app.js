import { FUND, LPS } from './fund.js';
import { computeFund, allocateToLPs, xirr, accruePreferred, fmtMoney, runWaterfall } from './waterfall.js';

const $ = (s) => document.querySelector(s);
const pct = (n) => (n * 100).toFixed(1) + '%';
const pct2 = (n) => (n * 100).toFixed(2) + '%';
const x = (n) => n.toFixed(2) + 'x';

let params = { hurdle: 0.08, carry: 0.20, catchUpRate: 1.0, mode: 'european' };
let selectedDeal = null;

// ------------------------------------------------------------------ fund math
function fundStats() {
  const contributed = FUND.deals.reduce((s, d) => s + d.contributed, 0);
  const realized = FUND.deals.reduce((s, d) => s + d.realized, 0);
  const unrealized = FUND.deals.reduce((s, d) => s + (d.unrealizedValue || 0), 0);

  const flows = [
    ...FUND.deals.flatMap((d) => d.calls.map((c) => ({ date: c.date, amount: -c.amount }))),
    ...FUND.deals.flatMap((d) => d.dists.map((c) => ({ date: c.date, amount: c.amount }))),
  ].sort((a, b) => new Date(a.date) - new Date(b.date));

  // Net asset value counts as a terminal inflow for the "net IRR incl. NAV" view.
  const withNav = [...flows, { date: FUND.asOf, amount: unrealized }];

  return {
    contributed, realized, unrealized,
    totalValue: realized + unrealized,
    dpi: realized / contributed,
    tvpi: (realized + unrealized) / contributed,
    grossIrr: xirr(withNav),
    realizedIrr: xirr(flows),
    flows,
  };
}

// ------------------------------------------------------------------ render
function renderHeader() {
  const s = fundStats();
  const res = computeFund(FUND, params, FUND.asOf);
  const tiles = [
    { k: 'Committed', v: fmtMoney(FUND.committed), sub: `vintage ${FUND.vintage}`, cls: '' },
    { k: 'Contributed', v: fmtMoney(s.contributed), sub: `${pct(s.contributed / FUND.committed)} called`, cls: '' },
    { k: 'DPI', v: x(s.dpi), sub: `${fmtMoney(s.realized)} distributed`, cls: 'good' },
    { k: 'TVPI', v: x(s.tvpi), sub: `incl. ${fmtMoney(s.unrealized)} NAV`, cls: 'good' },
    { k: 'Gross IRR', v: s.grossIrr != null ? pct(s.grossIrr) : '—', sub: 'money-weighted, incl. NAV', cls: '' },
    { k: 'GP carry', v: fmtMoney(res.gpTotal), sub: `${pct(res.gpTotal / Math.max(res.distributable, 1))} of proceeds`, cls: 'warn' },
  ];
  $('#metrics').innerHTML = tiles
    .map((t) => `<div class="metric ${t.cls}"><div class="k">${t.k}</div><div class="v">${t.v}</div><div class="sub">${t.sub}</div></div>`)
    .join('');
}

function renderControls() {
  $('#controls').innerHTML = `
    <label class="fld">Hurdle (pref)
      <input type="range" id="pHurdle" min="0" max="0.15" step="0.005" value="${params.hurdle}">
      <span class="mono" style="color:var(--ink);font-size:12px">${pct2(params.hurdle)}</span>
    </label>
    <label class="fld">Carried interest
      <input type="range" id="pCarry" min="0" max="0.30" step="0.01" value="${params.carry}">
      <span class="mono" style="color:var(--ink);font-size:12px">${pct(params.carry)}</span>
    </label>
    <label class="fld">GP catch-up rate
      <input type="range" id="pCatch" min="0" max="1" step="0.05" value="${params.catchUpRate}">
      <span class="mono" style="color:var(--ink);font-size:12px">${pct(params.catchUpRate)}</span>
    </label>
    <label class="fld">Waterfall structure
      <select id="pMode">
        <option value="european" ${params.mode === 'european' ? 'selected' : ''}>European (whole fund)</option>
        <option value="american" ${params.mode === 'american' ? 'selected' : ''}>American (deal-by-deal)</option>
      </select>
    </label>`;

  const bind = (id, key, isNum = true) =>
    $(id).addEventListener('input', (e) => {
      params[key] = isNum ? parseFloat(e.target.value) : e.target.value;
      render();
    });
  bind('#pHurdle', 'hurdle');
  bind('#pCarry', 'carry');
  bind('#pCatch', 'catchUpRate');
  bind('#pMode', 'mode', false);
}

function renderWaterfall() {
  const res = computeFund(FUND, params, FUND.asOf);

  const blocks = res.waterfalls
    .map((w) => {
      const maxCash = Math.max(w.distributable, 1);
      const rows = w.tiers
        .map((t) => {
          const total = t.lp + t.gp;
          if (total < 1 && t.tier !== 4) {
            return `<tr style="opacity:.45"><td>${t.tier}</td><td>${t.name}</td><td>${t.basis}</td><td class="num">—</td><td class="num">—</td><td></td></tr>`;
          }
          return `<tr>
            <td>${t.tier}</td>
            <td style="color:var(--ink)">${t.name}</td>
            <td style="color:var(--ink-3)">${t.basis}</td>
            <td class="num" style="color:var(--accent)">${fmtMoney(t.lp)}</td>
            <td class="num" style="color:var(--amber)">${t.gp > 0 ? fmtMoney(t.gp) : '—'}</td>
            <td style="width:110px">
              <div class="bar" style="margin:0">
                <i style="width:${(t.lp / maxCash) * 100}%;background:var(--accent)"></i>
                <i style="width:${(t.gp / maxCash) * 100}%;background:var(--amber)"></i>
              </div>
            </td>
          </tr>`;
        })
        .join('');

      return `<div class="dsec">
        <h3>${w.label} <span style="color:var(--ink-3);text-transform:none;letter-spacing:0;font-weight:400">— ${fmtMoney(w.distributable)} distributable, ${fmtMoney(w.preferredOwed)} pref accrued</span></h3>
        <table class="tbl">
          <thead><tr><th>#</th><th>Tier</th><th>Basis</th><th class="num">LP</th><th class="num">GP</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div style="display:flex;gap:16px;margin-top:9px;font-family:var(--mono);font-size:11.5px">
          <span style="color:var(--accent)">LP ${fmtMoney(w.lpTotal)} (${pct(w.lpTotal / Math.max(w.distributable, 1))})</span>
          <span style="color:var(--amber)">GP ${fmtMoney(w.gpTotal)} (${pct(w.gpTotal / Math.max(w.distributable, 1))})</span>
        </div>
      </div>`;
    })
    .join('');

  $('#waterfall').innerHTML = blocks;
  $('#wfCount').textContent = params.mode === 'european' ? '1 whole-fund waterfall' : `${res.waterfalls.length} deal waterfalls`;

  // Structure comparison: the same book under both structures.
  const euro = computeFund(FUND, { ...params, mode: 'european' }, FUND.asOf);
  const amer = computeFund(FUND, { ...params, mode: 'american' }, FUND.asOf);
  const delta = amer.gpTotal - euro.gpTotal;
  $('#compare').innerHTML = `
    <div class="card">
      <div class="desc">Same deals, same terms, different structure</div>
      <table class="tbl" style="margin-top:6px">
        <thead><tr><th>Structure</th><th class="num">LP proceeds</th><th class="num">GP carry</th></tr></thead>
        <tbody>
          <tr><td>European (whole fund)</td><td class="num" style="color:var(--accent)">${fmtMoney(euro.lpTotal)}</td><td class="num">${fmtMoney(euro.gpTotal)}</td></tr>
          <tr><td>American (deal-by-deal)</td><td class="num" style="color:var(--accent)">${fmtMoney(amer.lpTotal)}</td><td class="num">${fmtMoney(amer.gpTotal)}</td></tr>
        </tbody>
      </table>
      <div class="act" style="margin-top:9px">
        Deal-by-deal moves <strong style="color:${delta > 0 ? 'var(--amber)' : 'var(--accent)'}">${fmtMoney(Math.abs(delta))}</strong>
        ${delta > 0 ? 'to the GP' : 'to the LPs'} on this book. The gap is Ridgeline: a whole-fund
        waterfall nets the write-off against the winners before any carry is paid, while deal-by-deal
        pays carry on Larkspur and Calderwood years before Ridgeline is known to be impaired. That is
        the entire reason LPs negotiate for European and GPs push for American.
      </div>
    </div>`;
}

function renderDeals() {
  const rows = FUND.deals
    .map((d) => {
      const moic = d.contributed > 0 ? (d.realized + (d.unrealizedValue || 0)) / d.contributed : 0;
      const flows = [
        ...d.calls.map((c) => ({ date: c.date, amount: -c.amount })),
        ...d.dists.map((c) => ({ date: c.date, amount: c.amount })),
      ];
      if (d.unrealizedValue) flows.push({ date: FUND.asOf, amount: d.unrealizedValue });
      flows.sort((a, b) => new Date(a.date) - new Date(b.date));
      const irr = xirr(flows);
      const cls = moic >= 2 ? 'ok' : moic >= 1 ? 'warn' : 'bad';
      return `<div class="row" data-deal="${d.name}" style="grid-template-columns:minmax(0,1fr) 66px 62px 62px">
        <div>
          <div class="t">${d.name}</div>
          <div class="m">${d.sector} · ${fmtMoney(d.contributed)} invested${d.note ? ' · ' + d.note : ''}</div>
        </div>
        <div class="num"><span class="chip ${cls}">${x(moic)}</span></div>
        <div class="num" style="color:var(--ink-2)">${irr != null ? pct(irr) : '—'}</div>
        <div class="num" style="color:${d.realized > 0 ? 'var(--accent)' : 'var(--ink-3)'}">${d.realized > 0 ? fmtMoney(d.realized) : 'held'}</div>
      </div>`;
    })
    .join('');
  $('#deals').innerHTML = rows;
}

function renderLPs() {
  const res = computeFund(FUND, params, FUND.asOf);
  const contributed = FUND.deals.reduce((s, d) => s + d.contributed, 0);
  const { rows, carryRebate, gpNet } = allocateToLPs(LPS, res.lpTotal, res.gpTotal, contributed);

  $('#lps').innerHTML =
    `<table class="tbl" style="width:100%">
      <thead><tr><th>Limited partner</th><th class="num">Commit</th><th class="num">Share</th><th class="num">Allocation</th><th class="num">Net MOIC</th></tr></thead>
      <tbody>${rows
        .map((r) => `<tr>
          <td style="color:var(--ink)">${r.name}
            ${r.sideLetter ? `<div style="color:var(--violet);font-size:10.5px;margin-top:2px">${r.sideLetter}</div>` : `<div style="color:var(--ink-3);font-size:10.5px;margin-top:2px">${r.type}</div>`}
          </td>
          <td class="num">${fmtMoney(r.commitment)}</td>
          <td class="num">${pct(r.share)}</td>
          <td class="num" style="color:var(--accent)">${fmtMoney(r.amount)}</td>
          <td class="num">${x(r.amount / Math.max(r.contributed, 1))}</td>
        </tr>`)
        .join('')}
      </tbody>
    </table>
    <div class="note" style="margin-top:11px">
      Two LPs hold reduced-carry side letters, which rebate ${fmtMoney(carryRebate)} of GP carry back to
      them pro rata. GP carry net of side letters is <strong style="color:var(--amber)">${fmtMoney(gpNet)}</strong>,
      not the ${fmtMoney(res.gpTotal)} the headline waterfall produces. Allocators that apply a flat
      pro-rata split to the LP column and stop there quietly overpay the GP by exactly this amount.
    </div>`;
}

function renderPref() {
  const calls = FUND.deals.flatMap((d) => d.calls);
  const dists = FUND.deals.flatMap((d) => d.dists);
  const at8 = accruePreferred(calls, dists, 0.08, FUND.asOf);
  const cur = accruePreferred(calls, dists, params.hurdle, FUND.asOf);
  cur.preferredOwedNow = cur.preferredOwed;
  const simple = FUND.deals.reduce((s, d) => s + d.contributed, 0) * params.hurdle * 6.5;

  $('#pref').innerHTML = `
    <dl class="kv">
      <dt>Unreturned capital</dt><dd>${fmtMoney(cur.unreturnedCapital)}</dd>
      <dt>Pref earned @ ${pct2(params.hurdle)}</dt><dd style="color:var(--accent)">${fmtMoney(cur.preferredEarned)}</dd>
      <dt>Pref earned @ 8.00%</dt><dd>${fmtMoney(at8.preferredEarned)}</dd>
      <dt>Still unpaid today</dt><dd>${fmtMoney(cur.preferredOwedNow)}</dd>
      <dt>Naive flat calc</dt><dd style="color:var(--rose)">${fmtMoney(simple)}</dd>
    </dl>
    <div class="note" style="margin-top:10px">
      The pref compounds on <em>unreturned</em> capital and is retired by distributions in order, so it
      is path-dependent: two funds with identical commitments and identical total distributions owe
      different preferred returns if the cash moved on different dates. Multiplying commitments by the
      hurdle and a term — the flat calc above — is off by
      <strong>${fmtMoney(Math.abs(simple - cur.preferredEarned))}</strong> here.
    </div>`;
}

function render() {
  renderHeader();
  renderControls();
  renderWaterfall();
  renderDeals();
  renderLPs();
  renderPref();
}

$('#asOf').textContent = FUND.asOf;
$('#fundName').textContent = FUND.name;
render();

window.fundModel = { FUND, LPS, computeFund, runWaterfall, xirr, accruePreferred, params };
