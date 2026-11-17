import type { StockEvent } from './types'
import type { EventMapping } from './domain/eventMapping'

export const eventTypeLabels: Record<StockEvent['type'], string> = {
  announcement: '公告', news: '新闻', industry: '行业事件', financial: '财务披露',
}
export const assertionLabels: Record<StockEvent['assertion'], string> = { fact: '事实（模拟）', opinion: '观点' }
export const mappingReasonLabels: Record<EventMapping['reason'], string> = {
  'before-open': '盘前，归入当日', session: '盘中，归入当日',
  'midday-break': '午间休市，归入当日', close: '恰好收盘，归入当日',
  'after-close': '盘后，归入日历中的下一交易日',
  'non-trading-day': '非交易日，归入日历中的下一交易日',
  'calendar-insufficient': '日历不足，暂无法映射',
}
export function formatPercent(ratio: number) {
  return `${ratio >= 0 ? '+' : '−'}${Math.abs(ratio * 100).toFixed(2)}%`
}
export function formatPrice(cents: number) {
  return (cents / 100).toFixed(2)
}
