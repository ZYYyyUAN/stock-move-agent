import { afterEach, describe, expect, it, vi } from 'vitest'
import { getCloseTimestamp, mapEvent, mapEvents, toExchangeTime } from '../../src/domain/eventMapping'
import { loadDataset } from '../../src/domain/loadDataset'

const dataset = loadDataset()

afterEach(() => vi.unstubAllEnvs())

describe('交易所时间与交易日映射', () => {
  it.each([
    ['盘后事件', '2026-03-06T18:00:00+08:00', '2026-03-09', 'after-close'],
    ['非交易日事件', '2026-03-07T10:00:00+08:00', '2026-03-09', 'non-trading-day'],
    ['显式工作日休市', '2026-03-18T10:00:00+08:00', '2026-03-19', 'non-trading-day'],
    ['盘前', '2026-03-09T08:30:00+08:00', '2026-03-09', 'before-open'],
    ['午夜', '2026-03-08T16:00:00Z', '2026-03-09', 'before-open'],
    ['上午开盘', '2026-03-09T09:30:00+08:00', '2026-03-09', 'session'],
    ['盘中 UTC', '2026-03-09T02:00:00Z', '2026-03-09', 'session'],
    ['上午收盘', '2026-03-09T11:30:00+08:00', '2026-03-09', 'session'],
    ['午间休市', '2026-03-09T12:00:00+08:00', '2026-03-09', 'midday-break'],
    ['下午开盘', '2026-03-09T13:00:00+08:00', '2026-03-09', 'session'],
    ['恰好收盘', '2026-03-06T07:00:00Z', '2026-03-06', 'close'],
    ['收盘后一秒', '2026-03-06T07:00:01Z', '2026-03-09', 'after-close'],
    ['收盘后一毫秒', '2026-03-06T07:00:00.001Z', '2026-03-09', 'after-close'],
    ['不同偏移跨日', '2026-03-08T21:00:00-05:00', '2026-03-09', 'session'],
  ])('%s', (_name, publishedAt, tradingDate, reason) => {
    expect(mapEvent(publishedAt, dataset)).toMatchObject({ status: 'mapped', tradingDate, reason, hasCandle: true })
  })

  it.each(['UTC', 'America/Los_Angeles', 'Asia/Tokyo'])('不依赖宿主时区 %s', timezone => {
    vi.stubEnv('TZ', timezone)
    expect(toExchangeTime('2026-03-08T16:00:00Z', dataset.market.timezone)).toEqual({ date: '2026-03-09', time: '00:00:00' })
    expect(toExchangeTime('2026-03-06T07:00:00.001Z', dataset.market.timezone)).toEqual({ date: '2026-03-06', time: '15:00:00.001' })
    expect(mapEvent('2026-03-06T07:00:00Z', dataset).tradingDate).toBe('2026-03-06')
    expect(getCloseTimestamp('2026-03-13', dataset.market)).toBe(Date.parse('2026-03-13T07:00:00Z'))
  })

  it('行情范围外仍映射成功，并明确没有行情', () => {
    expect(mapEvent('2026-03-27T16:00:00+08:00', dataset)).toEqual({
      exchangeDate: '2026-03-27', exchangeTime: '16:00:00',
      status: 'mapped', tradingDate: '2026-03-30', reason: 'after-close', hasCandle: false,
    })
  })

  it.each([
    '2026-04-03T16:00:00+08:00',
    '2026-04-04T10:00:00+08:00',
    '2026-02-26T10:00:00+08:00',
  ])('日历不足时不推断：%s', publishedAt => {
    expect(mapEvent(publishedAt, dataset)).toMatchObject({
      status: 'unmapped', tradingDate: null, reason: 'calendar-insufficient', hasCandle: false,
    })
  })

  it('按绝对时刻排序，不按 ISO 字符串或输入顺序排序', () => {
    const input = loadDataset()
    const earlier = input.events[0]
    const later = input.events[1]
    earlier.publishedAt = '2026-03-08T23:00:00-05:00'
    later.publishedAt = '2026-03-09T03:00:00Z'
    input.events = [earlier, later]
    input.evidence = input.evidence.filter(item => input.events.some(event => event.id === item.eventId))
    input.factors = []
    const validated = loadDataset(input)
    const before = structuredClone(validated)
    expect(mapEvents(validated).map(item => item.event.id)).toEqual([later.id, earlier.id])
    expect(validated).toEqual(before)
  })

  it('使用配置中的最终收盘时刻', () => {
    const input = loadDataset()
    input.market.sessions[1].close = '14:00:00'
    const validated = loadDataset(input)
    expect(getCloseTimestamp('2026-03-09', validated.market)).toBe(Date.parse('2026-03-09T06:00:00Z'))
    expect(mapEvent('2026-03-09T14:00:00+08:00', validated).reason).toBe('close')
    expect(mapEvent('2026-03-09T14:00:01+08:00', validated).tradingDate).toBe('2026-03-10')
  })
})
