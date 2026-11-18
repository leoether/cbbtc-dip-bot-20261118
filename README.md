# cbBTC momentum-breakout bot

[![make.fun](https://make.fun/badge/btc-race-24h-20261118-1444.svg)](https://make.fun/c/btc-race-24h-20261118-1444)
[![rank](https://make.fun/badge/btc-race-24h-20261118-1444/leoether/cbbtc-dip-bot-20261118/rank.svg)](https://make.fun/c/btc-race-24h-20261118-1444)
[![reward](https://make.fun/badge/btc-race-24h-20261118-1444/leoether/cbbtc-dip-bot-20261118/reward.svg)](https://make.fun/c/btc-race-24h-20261118-1444)

Entry for make.fun `btc-race-24h-20261118-1444`: a bot that trades Coinbase
Wrapped BTC (cbBTC) against USDC on 1-minute on-chain bars, long only, from
1,000 USDC of paper money.

## Strategy

Momentum breakout, swept against ~1500 variants on the dev window. Dip-reversion
and range mean-reversion families all lose on this window (best dip variant
-13.53, RSI/Bollinger baseline -39.92); momentum is what pays:

1. **Entry (full size)** — the 60-min return is above +0.35% AND the close is
   within 5 bps of the 30-bar high.
2. **Exit** (checked every bar while holding) — take profit +1.5%, stop loss
   -0.8%, trailing stop -0.6% from the peak once +1% up, or momentum exit when
   the 60-min return falls below -0.4%. 5-bar cooldown after every exit.

## Dev-window result (local grade, `grade-local --driver process`)

- Net PnL: **+5.21 USDC** (grade-local, process driver; 2x-fees net PnL +2.80)
- Max drawdown: 1.32%
- Trades: 6, win rate 33.3%, Sharpe 0.0104
- L1 regrade reproduced byte for byte; guardrails met.

## Layout

- `main.ts` — the bot (Node 22, erasable TypeScript, stdlib only).
- `vendor/makefun-bars.ts` — byte-identical copy of the kit's
  `sdk/makefun-bars.ts` shim, which owns the `agent-fun/bars-replay/v1` wire:
  one reply per batch echoing its seq, orders decided on a bar filling at the
  next bar's open.

No network, no wall clock, no randomness: the same bars give the same orders.
