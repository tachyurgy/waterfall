# Waterfall

**Private-equity distribution waterfall engine: European and American, verified to the penny.**

Live: **https://waterfall.levelbrook.com**

## What this is

Fund administration is one of the few software domains where the correct answer is a contractual
document and the tolerance is a penny. This runs the full four-tier structure (return of capital, compounding
preferred return, GP catch-up, residual carry split) against a 2019 vintage mid-market buyout book of eight
deals, six realized and one written off.

## Engineering notes

### Preferred return accrues by date

Accrual runs on unreturned capital by date rather than the
common shortcut of commitments times hurdle times term. That shortcut is off by about $70M on this book, which
is exactly the class of error that survives review because it looks plausible.

### Catch-up solved algebraically

The GP catch-up tier is solved as
`x = (carry * profit - prior_carry) / (1 - carry)` rather than iterated, so a partial catch-up lands exactly on
the target carry percentage. Verified: the GP ends on precisely 20.00 percent of profit under a European
waterfall, and LP plus GP conserves to the distributable total.

### European and American side by side

American runs deal-by-deal and yields the GP 22.14 percent
on the same book, because it pays carry on early winners years before a later deal is known to be impaired.
That gap is the entire negotiation, so both are shown together.

### Per-LP allocation with side letters

Reduced-carry side letters are modeled explicitly. A naive
pro-rata allocator quietly overpays the GP here.

## Stack

Vanilla JavaScript, deterministic calculation engine, static hosting


## Running it

Static. Open `index.html`, or serve the directory:

```
python3 -m http.server 8000
```

## Honest scope

This is a focused engineering demo, not a production system. The data is synthetic and generated
locally so that the behaviour is reproducible. The reasoning, the arithmetic and the failure modes
are the point; the surface area is deliberately narrow.

## License

MIT
