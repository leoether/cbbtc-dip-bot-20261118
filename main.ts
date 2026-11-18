// Momentum-breakout bot for cbBTC (btc-race-24h-20261118-1444).
//
// Why this shape: the dev window falls 2.8% overall, so buy-and-hold and
// dip-buying both lose (the kit's RSI/Bollinger baseline loses ~$40 here).
// The window's only real money is a slow 5-hour recovery leg (+2%) after
// the opening waterfall, plus a few range swings. This bot therefore
// trades rarely and only with the hourly momentum behind it:
//
//   - Entry: the 60-minute return is above +0.35% AND the close is at
//     (within 5 bps of) the 30-bar high: a breakout with momentum, not a
//     falling knife. Full size, long only.
//   - Exit: take profit at +1.5% over cost, stop at -0.8%, a trailing
//     stop of -0.6% from the peak once +1% up, or the 60-minute return
//     turning below -0.4% (momentum gone). 5-bar cooldown after an exit
//     so one whipsaw does not re-enter instantly.
//
// A full round trip costs ~26 bps (4 bps fee + 2 bps slippage + impact),
// so the +0.35% entry filter and +1.5% target both clear the cost with
// margin. Everything is a pure function of the bars seen so far: no wall
// clock, no network, no randomness; the same bars give the same orders.

import { BPS, runBars, type Bar, type BarsState, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const MOM_WIN = 60; // bars for the momentum return
const MOM_IN = 0.0035; // enter when the 60-bar return beats this
const MOM_OUT = -0.004; // exit when the 60-bar return falls below this
const HI_WIN = 30; // bars for the breakout high
const HI_TOL = 0.0005; // close within 5 bps of the 30-bar high
const TAKE_PROFIT = 0.015; // +1.5% over cost
const STOP_LOSS = -0.008; // -0.8% under cost
const TRAIL_ARM = 0.01; // trailing stop arms once +1% up
const TRAIL_DROP = -0.006; // then exits on a -0.6% pullback from the peak
const COOLDOWN_BARS = 5;
const MAX_SLIPPAGE_BPS = 100;

const closes: number[] = [];
const highs: number[] = [];
let cooldown = 0;
let peak = 0; // highest close seen while holding, in price units

function ret60(): number | null {
  if (closes.length <= MOM_WIN) return null;
  const now = closes[closes.length - 1];
  const then = closes[closes.length - 1 - MOM_WIN];
  return now / then - 1;
}

function hi30(): number | null {
  if (highs.length < HI_WIN) return null;
  let hi = 0;
  for (let i = highs.length - HI_WIN; i < highs.length; i++) {
    if (highs[i] > hi) hi = highs[i];
  }
  return hi;
}

await runBars({
  onBatch(state: BarsState, batch: { bars: Bar[] }) {
    for (const bar of batch.bars) {
      closes.push(Number(bar.c));
      highs.push(Number(bar.h));
    }
    if (cooldown > 0) cooldown -= 1;

    const symbol = state.hello.symbols[0].symbol;
    const held = state.positions.get(symbol);
    const closeRaw = state.close(symbol);
    const orders: (SellInput | BuyInput)[] = [];
    if (closeRaw === null) return orders;
    const close = Number(closeRaw); // price units as float64 for indicator math

    if (held !== undefined) {
      const value = state.value(symbol, held.qty);
      const cost = held.cost;
      const ret = cost > 0n ? Number(value - cost) / Number(cost) : 0;
      if (close > peak) peak = close;
      const mom = ret60();
      const trailHit = ret >= TRAIL_ARM && peak > 0 && close / peak - 1 <= TRAIL_DROP;
      const momGone = mom !== null && mom < MOM_OUT;
      if (ret >= TAKE_PROFIT || ret <= STOP_LOSS || trailHit || momGone) {
        orders.push({ side: 'sell', symbol, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS });
        cooldown = COOLDOWN_BARS;
        peak = 0;
      }
      return orders;
    }

    if (cooldown > 0) return orders;
    const mom = ret60();
    const hi = hi30();
    if (mom === null || hi === null) return orders;
    if (mom > MOM_IN && close >= hi * (1 - HI_TOL)) {
      const stake = state.equity < state.cash ? state.equity : state.cash;
      const byWeight = (BigInt(state.hello.caps.max_weight_bps) * state.equity) / BPS;
      const notional = stake < byWeight ? stake : byWeight;
      if (notional >= BigInt(state.hello.fees.min_notional_quote_units)) {
        orders.push({ side: 'buy', symbol, notional_quote_units: notional, max_slippage_bps: MAX_SLIPPAGE_BPS });
        peak = close;
      }
    }
    return orders;
  },
});
