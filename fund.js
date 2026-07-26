// A synthetic mid-market buyout fund: 8 platform deals, 6 realized.
// Vintage 2019, $420M committed. Numbers are plausible rather than random —
// a 2.1x gross MOIC book with one write-off and one outlier, which is what a
// real fund's deal-by-deal distribution actually looks like.

export const FUND = {
  name: 'Meridian Partners III, L.P.',
  vintage: 2019,
  committed: 420_000_000,
  asOf: '2026-06-30',
  deals: [
    {
      name: 'Calderwood Industrial',
      sector: 'Industrials',
      contributed: 62_000_000,
      realized: 148_000_000,
      calls: [
        { date: '2019-11-14', amount: 44_000_000 },
        { date: '2021-03-02', amount: 18_000_000 },
      ],
      dists: [
        { date: '2023-06-15', amount: 40_000_000 },
        { date: '2025-02-28', amount: 108_000_000 },
      ],
    },
    {
      name: 'Northgate Diagnostics',
      sector: 'Healthcare services',
      contributed: 55_000_000,
      realized: 121_500_000,
      calls: [
        { date: '2020-02-20', amount: 38_000_000 },
        { date: '2021-09-08', amount: 17_000_000 },
      ],
      dists: [
        { date: '2024-04-10', amount: 30_000_000 },
        { date: '2025-11-19', amount: 91_500_000 },
      ],
    },
    {
      name: 'Larkspur Software',
      sector: 'Enterprise software',
      contributed: 71_000_000,
      realized: 214_000_000,
      calls: [
        { date: '2019-07-30', amount: 50_000_000 },
        { date: '2020-10-12', amount: 21_000_000 },
      ],
      dists: [
        { date: '2022-12-01', amount: 26_000_000 },
        { date: '2024-08-22', amount: 74_000_000 },
        { date: '2026-03-17', amount: 114_000_000 },
      ],
    },
    {
      name: 'Tessellate Packaging',
      sector: 'Packaging',
      contributed: 48_000_000,
      realized: 61_200_000,
      calls: [{ date: '2020-06-09', amount: 48_000_000 }],
      dists: [{ date: '2025-05-30', amount: 61_200_000 }],
    },
    {
      name: 'Ridgeline Logistics',
      sector: 'Transportation',
      contributed: 39_000_000,
      realized: 4_100_000,
      calls: [
        { date: '2021-01-25', amount: 27_000_000 },
        { date: '2022-05-16', amount: 12_000_000 },
      ],
      dists: [{ date: '2025-09-12', amount: 4_100_000 }],
      note: 'Substantially written off — freight cycle reversal',
    },
    {
      name: 'Ashgrove Specialty Chem',
      sector: 'Specialty chemicals',
      contributed: 44_000_000,
      realized: 96_800_000,
      calls: [{ date: '2021-04-06', amount: 44_000_000 }],
      dists: [{ date: '2026-01-23', amount: 96_800_000 }],
    },
    {
      name: 'Vantage Facility Services',
      sector: 'Business services',
      contributed: 51_000_000,
      realized: 0,
      calls: [
        { date: '2022-08-11', amount: 34_000_000 },
        { date: '2023-11-29', amount: 17_000_000 },
      ],
      dists: [],
      note: 'Unrealized — held at 1.7x on the latest mark',
      unrealizedValue: 86_700_000,
    },
    {
      name: 'Brightwater Utilities',
      sector: 'Infrastructure',
      contributed: 33_000_000,
      realized: 0,
      calls: [{ date: '2023-05-04', amount: 33_000_000 }],
      dists: [],
      note: 'Unrealized — held at 1.3x on the latest mark',
      unrealizedValue: 42_900_000,
    },
  ],
};

// Limited partners. Two carry a reduced-carry side letter, which is exactly the
// sort of term that quietly breaks a naive pro-rata allocator.
export const LPS = [
  { id: 'LP-001', name: 'Kestrel State Retirement System', type: 'Public pension', commitment: 105_000_000 },
  { id: 'LP-002', name: 'Aldergrove University Endowment', type: 'Endowment', commitment: 72_000_000, carryOverride: 0.85, sideLetter: '15% carry rebate — anchor LP, first close' },
  { id: 'LP-003', name: 'Ph. Wentworth Family Office', type: 'Family office', commitment: 48_000_000 },
  { id: 'LP-004', name: 'Nordvik Pensjonskasse', type: 'Sovereign / pension', commitment: 63_000_000 },
  { id: 'LP-005', name: 'Halcyon Fund-of-Funds II', type: 'Fund of funds', commitment: 55_000_000, carryOverride: 0.9, sideLetter: '10% carry rebate — re-up from Fund II' },
  { id: 'LP-006', name: 'Merrivale Insurance Group', type: 'Insurance', commitment: 41_000_000 },
  { id: 'LP-007', name: 'GP commitment (Meridian Partners)', type: 'GP commit', commitment: 36_000_000 },
];
