import type { Dataset } from '../types'

export function calculatePriceChange(close: number, previousClose: number) {
  const difference = BigInt(close) - BigInt(previousClose)
  const magnitude = difference < 0n ? -difference : difference
  return {
    changeRatio: (close - previousClose) / previousClose,
    isAnomaly: magnitude * 100n >= BigInt(previousClose) * 5n,
  }
}

export type PriceChange = { date: string; previousDate: string | null } & (
  | { status: 'calculated'; previousClose: number; changeRatio: number; isAnomaly: boolean }
  | { status: 'missing-previous-close' }
)

export function calculatePriceChanges(dataset: Pick<Dataset, 'market' | 'calendar' | 'candles'>): PriceChange[] {
  const tradingDays = dataset.calendar.days.filter(day => day.isTradingDay)
  return dataset.candles.map<PriceChange>(candle => {
    const previousDate = tradingDays.filter(day => day.date < candle.date).at(-1)?.date ?? null
    const previousClose = previousDate === dataset.market.previousClose.date
      ? dataset.market.previousClose.close
      : dataset.candles.find(item => item.date === previousDate)?.close
    // 前一交易日缺行情时，不能用更早的可见收盘价替代。
    if (previousClose === undefined) return { date: candle.date, previousDate, status: 'missing-previous-close' }
    return {
      date: candle.date, previousDate, status: 'calculated', previousClose,
      ...calculatePriceChange(candle.close, previousClose),
    }
  })
}
