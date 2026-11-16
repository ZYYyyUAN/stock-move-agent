import type { Dataset, Market } from '../types'

export type MappingReason = 'before-open' | 'session' | 'midday-break' | 'close' | 'after-close' | 'non-trading-day'

export type EventMapping = {
  exchangeDate: string
  exchangeTime: string
} & (
  | { status: 'mapped'; tradingDate: string; reason: MappingReason; hasCandle: boolean }
  | { status: 'unmapped'; tradingDate: null; reason: 'calendar-insufficient'; hasCandle: false }
)

/** 输入来自 loadDataset；日期分量始终按交易所时区提取。 */
export function toExchangeTime(publishedAt: string, timezone: Market['timezone']) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    fractionalSecondDigits: 3,
    hourCycle: 'h23',
  }).formatToParts(new Date(publishedAt))
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  const fraction = values.fractionalSecond === '000' ? '' : `.${values.fractionalSecond}`
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}:${values.second}${fraction}`,
  }
}

export function getCloseTimestamp(tradingDate: string, market: Market): number {
  const close = market.sessions.at(-1)!.close
  const utc = Date.parse(`${tradingDate}T${close}Z`)
  const local = toExchangeTime(new Date(utc).toISOString(), market.timezone)
  const offset = Date.parse(`${local.date}T${local.time}Z`) - utc
  return utc - offset
}

export function mapEvent(publishedAt: string, dataset: Pick<Dataset, 'market' | 'calendar' | 'candles'>): EventMapping {
  const { date, time } = toExchangeTime(publishedAt, dataset.market.timezone)
  const local = { exchangeDate: date, exchangeTime: time }
  const day = dataset.calendar.days.find(item => item.date === date)
  if (!day) {
    return { ...local, status: 'unmapped', tradingDate: null, reason: 'calendar-insufficient', hasCandle: false }
  }

  const timestamp = Date.parse(publishedAt)
  const closeTimestamp = getCloseTimestamp(date, dataset.market)
  const afterClose = timestamp > closeTimestamp
  if (!day.isTradingDay || afterClose) {
    const next = dataset.calendar.days.find(item => item.date > date && item.isTradingDay)
    if (!next) {
      return { ...local, status: 'unmapped', tradingDate: null, reason: 'calendar-insufficient', hasCandle: false }
    }
    return {
      ...local, status: 'mapped', tradingDate: next.date,
      reason: day.isTradingDay ? 'after-close' : 'non-trading-day',
      hasCandle: dataset.candles.some(candle => candle.date === next.date),
    }
  }

  const sessions = dataset.market.sessions
  let reason: MappingReason = 'midday-break'
  if (time < sessions[0].open) reason = 'before-open'
  else if (timestamp === closeTimestamp) reason = 'close'
  else if (sessions.some(session => time >= session.open && time <= session.close)) reason = 'session'

  return {
    ...local, status: 'mapped', tradingDate: date, reason,
    hasCandle: dataset.candles.some(candle => candle.date === date),
  }
}

export function mapEvents(dataset: Dataset) {
  return [...dataset.events]
    .sort((left, right) => Date.parse(left.publishedAt) - Date.parse(right.publishedAt))
    .map(event => ({ event, mapping: mapEvent(event.publishedAt, dataset) }))
}
