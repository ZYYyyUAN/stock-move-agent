import { describe, expect, it } from 'vitest'
import market from '../../src/data/market.json'
import calendar from '../../src/data/calendar.json'
import candles from '../../src/data/candles.json'
import events from '../../src/data/events.json'
import sources from '../../src/data/sources.json'
import evidence from '../../src/data/evidence.json'
import financials from '../../src/data/financials.json'
import factors from '../../src/data/factors.json'
import { DatasetValidationError, loadDataset } from '../../src/domain/loadDataset'

const fixture = () => structuredClone({ market, calendar, candles, events, sources, evidence, financials, factors })
type Fixture = ReturnType<typeof fixture>

function expectIssue(input: unknown, path: string) {
  try {
    loadDataset(input)
  } catch (error) {
    if (!(error instanceof DatasetValidationError)) throw error
    expect(error.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path, message: expect.any(String) }),
    ]))
    return
  }
  expect.fail('预期加载入口拒绝无效数据')
}

describe('默认模拟数据', () => {
  it('加载完整数据、前收盘基准与主要故事材料', () => {
    const dataset = loadDataset()
    expect(dataset.market.simulated).toBe(true)
    expect(dataset.market.previousClose).toEqual({ date: '2026-02-27', close: 980 })
    expect(dataset.candles).toHaveLength(19)
    expect(dataset.candles[0].date).toBe('2026-03-02')
    expect(dataset.candles.at(-1)!.date).toBe('2026-03-27')
    expect(dataset.events).toHaveLength(14)
    expect(dataset.sources).toHaveLength(14)
    expect(dataset.evidence).toHaveLength(14)
    expect(dataset.financials).toHaveLength(3)
    expect(dataset.factors).toHaveLength(6)
    const closeByDate = new Map(dataset.candles.map(candle => [candle.date, candle.close]))
    expect([closeByDate.get('2026-03-06'), closeByDate.get('2026-03-09')]).toEqual([1000, 1090])
    expect([closeByDate.get('2026-03-12'), closeByDate.get('2026-03-13')]).toEqual([1100, 1012])
    expect(dataset.calendar.days.find(day => day.date === '2026-03-18')).toMatchObject({ isTradingDay: false })
  })

  it('保留不同时间表示、独立披露时间与弱证据候选，不预先计算映射或解释', () => {
    const dataset = loadDataset()
    expect(dataset.events.find(event => event.id === 'evt-order')!.publishedAt).toBe('2026-03-09T02:00:00Z')
    expect(dataset.events.find(event => event.id === 'evt-calendar')!.publishedAt).toBe('2026-04-03T16:00:00+08:00')
    expect(dataset.financials.find(item => item.id === 'fin-order-profit')!.publishedAt).toBe('2026-03-13T16:00:00+08:00')
    expect(dataset.factors.find(factor => factor.id === 'factor-comment')!.financialIds).toEqual([])
    expect(dataset.events.find(event => event.id === 'evt-comment')!.assertion).toBe('opinion')
    expect(dataset.events[0]).not.toHaveProperty('tradingDate')
    expect(dataset.factors[0]).not.toHaveProperty('confidence')
  })

  it('允许空行情，供后续空状态使用', () => {
    const input = fixture()
    input.candles = []
    expect(loadDataset(input).candles).toEqual([])
  })

  it('允许空事件及其关联集合', () => {
    const input = fixture()
    input.events = []
    input.sources = []
    input.evidence = []
    input.financials = []
    input.factors = []
    expect(loadDataset(input).events).toEqual([])
  })

  it('证据不足是合法状态，不伪造材料或丢弃观点', () => {
    const input = fixture()
    input.events[7].evidenceIds = []
    input.evidence = input.evidence.filter(item => item.eventId !== input.events[7].id)
    const dataset = loadDataset(input)
    expect(dataset.events[7].evidenceIds).toEqual([])
    expect(dataset.factors.find(factor => factor.id === 'factor-comment')).toBeDefined()
  })

  it('保留原文，不 trim 或修复输入', () => {
    const input = fixture()
    input.events[0].summary = '  模拟原始文本  '
    const before = structuredClone(input)
    expect(loadDataset(input).events[0].summary).toBe('  模拟原始文本  ')
    expect(input).toEqual(before)
  })
})

describe('入口字段级错误', () => {
  it.each([
    ['无时区时间', 'events.0.publishedAt', (input: Fixture) => { input.events[0].publishedAt = '2026-03-02T08:30:00' }],
    ['无效日期', 'events.0.publishedAt', (input: Fixture) => { input.events[0].publishedAt = '2026-02-30T08:30:00+08:00' }],
    ['无效小时', 'sources.0.publishedAt', (input: Fixture) => { input.sources[0].publishedAt = '2026-03-02T25:30:00+08:00' }],
    ['无效财务时间', 'financials.0.publishedAt', (input: Fixture) => { input.financials[0].publishedAt = 'yesterday' }],
    ['最低价高于最高价', 'candles.0.low', (input: Fixture) => { input.candles[0].low = input.candles[0].high + 1 }],
    ['开盘价越界', 'candles.0.open', (input: Fixture) => { input.candles[0].open = input.candles[0].high + 1 }],
    ['收盘价越界', 'candles.0.close', (input: Fixture) => { input.candles[0].close = input.candles[0].low - 1 }],
    ['价格不是整数分', 'candles.0.close', (input: Fixture) => { input.candles[0].close = 990.1 }],
    ['价格为零', 'candles.0.close', (input: Fixture) => { input.candles[0].close = 0 }],
    ['非法前收盘价', 'market.previousClose.close', (input: Fixture) => { input.market.previousClose.close = 0 }],
    ['负成交量', 'candles.0.volume', (input: Fixture) => { input.candles[0].volume = -1 }],
    ['重复行情日期', 'candles.1.date', (input: Fixture) => { input.candles[1].date = input.candles[0].date }],
    ['非交易日行情', 'candles.0.date', (input: Fixture) => { input.candles[0].date = '2026-02-28' }],
    ['前收盘基准晚于行情', 'candles.0.date', (input: Fixture) => { input.market.previousClose.date = '2026-03-03' }],
    ['前收盘日期非交易日', 'market.previousClose.date', (input: Fixture) => { input.market.previousClose.date = '2026-02-28' }],
    ['日历缺一天', 'calendar.days.3.date', (input: Fixture) => { input.calendar.days.splice(3, 1) }],
    ['空日历', 'calendar.days', (input: Fixture) => { input.calendar.days = [] }],
    ['日历日期格式错误', 'calendar.days.0.date', (input: Fixture) => { input.calendar.days[0].date = 'invalid' }],
    ['空交易时段', 'market.sessions', (input: Fixture) => { input.market.sessions = [] }],
    ['日历重复一天', 'calendar.days.1.date', (input: Fixture) => { input.calendar.days[1].date = input.calendar.days[0].date }],
    ['日历结束范围不匹配', 'calendar.coverageEnd', (input: Fixture) => { input.calendar.coverageEnd = '2026-04-04' }],
    ['日历范围倒置', 'calendar.coverageEnd', (input: Fixture) => { input.calendar.coverageStart = '2026-04-04' }],
    ['交易时段倒置', 'market.sessions.0.close', (input: Fixture) => { input.market.sessions[0].close = '09:00:00' }],
    ['交易时段重叠', 'market.sessions.1.open', (input: Fixture) => { input.market.sessions[1].open = '11:00:00' }],
    ['交易时区错误', 'market.timezone', (input: Fixture) => { input.market.timezone = 'UTC' }],
    ['非模拟来源', 'sources.0.simulated', (input: Fixture) => { input.sources[0].simulated = false }],
    ['空白标题', 'events.0.title', (input: Fixture) => { input.events[0].title = '  ' }],
  ] as const)('%s', (_name, path, mutate) => {
    const input = fixture()
    mutate(input)
    expectIssue(input, path)
  })

  it('拒绝 null、缺少集合和字符串价格，不静默转型', () => {
    expectIssue(null, '')
    expectIssue({ ...fixture(), events: undefined }, 'events')
    const input = fixture()
    expectIssue({ ...input, candles: [{ ...input.candles[0], close: '990' }] }, 'candles.0.close')
  })

  it('一次报告多处异常字段，保留原输入', () => {
    const input = fixture()
    input.events[0].publishedAt = 'invalid'
    input.candles[0].volume = -1
    const before = structuredClone(input)
    expectIssue(input, 'events.0.publishedAt')
    expectIssue(input, 'candles.0.volume')
    expect(input).toEqual(before)
  })
})

describe('引用完整性', () => {
  it.each([
    ['重复事件 ID', 'events.1.id', (input: Fixture) => { input.events[1].id = input.events[0].id }],
    ['重复来源 ID', 'sources.1.id', (input: Fixture) => { input.sources[1].id = input.sources[0].id }],
    ['重复证据 ID', 'evidence.1.id', (input: Fixture) => { input.evidence[1].id = input.evidence[0].id }],
    ['重复财务 ID', 'financials.1.id', (input: Fixture) => { input.financials[1].id = input.financials[0].id }],
    ['重复因素 ID', 'factors.1.id', (input: Fixture) => { input.factors[1].id = input.factors[0].id }],
    ['事件股票错误', 'events.0.stockId', (input: Fixture) => { input.events[0].stockId = 'SIM999' }],
    ['财务股票错误', 'financials.0.stockId', (input: Fixture) => { input.financials[0].stockId = 'SIM999' }],
    ['事件来源缺失', 'events.0.sourceId', (input: Fixture) => { input.events[0].sourceId = 'missing' }],
    ['事件证据缺失', 'events.0.evidenceIds.0', (input: Fixture) => { input.events[0].evidenceIds[0] = 'missing' }],
    ['事件引用他人证据', 'events.0.evidenceIds.0', (input: Fixture) => { input.events[0].evidenceIds[0] = input.events[1].evidenceIds[0] }],
    ['事件财务缺失', 'events.2.financialIds.0', (input: Fixture) => { input.events[2].financialIds[0] = 'missing' }],
    ['证据事件缺失', 'evidence.0.eventId', (input: Fixture) => { input.evidence[0].eventId = 'missing' }],
    ['证据来源缺失', 'evidence.0.sourceId', (input: Fixture) => { input.evidence[0].sourceId = 'missing' }],
    ['证据段落缺失', 'evidence.0.sectionId', (input: Fixture) => { input.evidence[0].sectionId = 'missing' }],
    ['引文不在原文', 'evidence.0.quote', (input: Fixture) => { input.evidence[0].quote = '原文未提供的内容' }],
    ['段落 ID 重复', 'sources.0.sections.1.sectionId', (input: Fixture) => { input.sources[0].sections[1].sectionId = 'notice' }],
    ['财务来源缺失', 'financials.0.sourceId', (input: Fixture) => { input.financials[0].sourceId = 'missing' }],
    ['候选事件缺失', 'factors.0.eventIds.0', (input: Fixture) => { input.factors[0].eventIds[0] = 'missing' }],
    ['候选财务缺失', 'factors.0.financialIds.0', (input: Fixture) => { input.factors[0].financialIds[0] = 'missing' }],
    ['候选日期不是交易日', 'factors.0.tradingDate', (input: Fixture) => { input.factors[0].tradingDate = '2026-03-18' }],
  ] as const)('%s', (_name, path, mutate) => {
    const input = fixture()
    mutate(input)
    expectIssue(input, path)
  })
})
