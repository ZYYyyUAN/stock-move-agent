import { describe, expect, it } from 'vitest'
import { explainDate } from '../../src/domain/explain'
import { loadDataset } from '../../src/domain/loadDataset'

describe('固定候选与证据边界', () => {
  it.each([
    ['2026-03-09', ['factor-earnings', 'factor-industry']],
    ['2026-03-13', ['factor-order-cancel', 'factor-comment']],
  ])('主要异动日 %s 返回合格因素、逐事件引用与未证实标签', (date, ids) => {
    const dataset = loadDataset()
    const before = structuredClone(dataset)
    const explanation = explainDate(dataset, date)
    expect(explanation.status).toBe('ready')
    expect(explanation.cutoff).toBe(`${date}T07:00:00.000Z`)
    expect(explanation.temporalRelation).toBe('时间相关性')
    expect(explanation.limitation).toContain('不能确认消息导致全日涨跌')
    expect(explanation.factors.map(factor => factor.id)).toEqual(ids)
    for (const factor of explanation.factors) {
      expect(factor.relationship).toBe('因果假设')
      expect(factor.verification).toBe('尚未证实')
      expect(['中', '低']).toContain(factor.confidence)
      expect(factor.mechanism.length).toBeGreaterThan(0)
      expect(factor.limitations.length).toBeGreaterThan(0)
      expect(factor.references.map(reference => reference.eventId)).toEqual(factor.eventIds)
      for (const reference of factor.references) {
        const event = dataset.events.find(event => event.id === reference.eventId)!
        expect(reference).toEqual({ eventId: event.id, sourceId: event.sourceId, assertion: event.assertion, evidenceIds: event.evidenceIds })
        for (const id of reference.evidenceIds) {
          const evidence = dataset.evidence.find(item => item.id === id)!
          const source = dataset.sources.find(item => item.id === evidence.sourceId)!
          expect(source.sections.find(section => section.sectionId === evidence.sectionId)!.text).toContain(evidence.quote)
        }
      }
    }
    expect(dataset).toEqual(before)
  })

  it('证据不足假设仍保留观点出处，置信度低且明确证据缺口', () => {
    const factor = explainDate(loadDataset(), '2026-03-13').factors.find(item => item.id === 'factor-comment')!
    expect(factor).toMatchObject({ confidence: '低', relationship: '因果假设', verification: '尚未证实' })
    expect(factor.confidenceReason).toContain('缺少')
    expect(factor.limitations.join('')).toContain('缺少资金流、投资者调查等直接证据')
    expect(factor.references).toEqual([{ eventId: 'evt-comment', sourceId: 'src-comment', assertion: 'opinion', evidenceIds: ['ev-comment'] }])
    expect(explainDate(loadDataset(), '2026-03-13').factors.find(item => item.id === 'factor-order-cancel')!.confidence).toBe('中')
  })

  it.each(['evt-comment', 'evt-order-cancel'])('缺少直接引文是低置信度业务状态：%s', eventId => {
    const input = loadDataset()
    input.events.find(event => event.id === eventId)!.evidenceIds = []
    input.evidence = input.evidence.filter(item => item.eventId !== eventId)
    const factor = explainDate(loadDataset(input), '2026-03-13').factors.find(item => item.eventIds.includes(eventId))!
    expect(factor.confidence).toBe('低')
    expect(factor.references[0].evidenceIds).toEqual([])
    expect(factor.verification).toBe('尚未证实')
  })

  it('禁止未来事件和旧报告期的未来财务信息进入当日解释', () => {
    const dataset = loadDataset()
    expect(dataset.factors.filter(factor => factor.id.startsWith('factor-future'))).toHaveLength(2)
    const explanation = explainDate(dataset, '2026-03-13')
    expect(explanation.factors.map(factor => factor.id)).toEqual(['factor-order-cancel', 'factor-comment'])
    expect(explanation.factors.flatMap(factor => factor.eventIds)).not.toContain('evt-followup')
    expect(explanation.factors.flatMap(factor => factor.financialIds)).not.toContain('fin-order-profit')
    // 次一交易日也不把上一日候选自动当作背景补入。
    expect(explainDate(dataset, '2026-03-16').factors).toEqual([])
  })

  it('事件已知但来源首次发布晚于收盘时，候选被排除', () => {
    const input = loadDataset()
    input.sources.find(source => source.id === 'src-order-cancel')!.publishedAt = '2026-03-13T16:00:00+08:00'
    expect(explainDate(loadDataset(input), '2026-03-13').factors.map(factor => factor.id)).toEqual(['factor-comment'])
  })

  it('财务记录已知但其来源晚于收盘时，候选被排除', () => {
    const input = loadDataset()
    input.financials.find(item => item.id === 'fin-cancelled-order')!.sourceId = 'src-followup'
    expect(explainDate(loadDataset(input), '2026-03-13').factors.map(factor => factor.id)).toEqual(['factor-comment'])
  })

  it('也检查关联事件中的财务引用，不能通过省略候选财务 ID 绕过截止时间', () => {
    const input = loadDataset()
    input.factors.find(factor => factor.id === 'factor-order-cancel')!.financialIds = []
    input.financials.find(item => item.id === 'fin-cancelled-order')!.publishedAt = '2026-03-13T16:00:00+08:00'
    expect(explainDate(loadDataset(input), '2026-03-13').factors.map(factor => factor.id)).toEqual(['factor-comment'])
  })

  it('收盘瞬间的事件、来源和财务仍可用，之后一毫秒不可用', () => {
    const input = loadDataset()
    input.events.find(event => event.id === 'evt-earnings')!.publishedAt = '2026-03-09T07:00:00Z'
    input.sources.find(source => source.id === 'src-earnings')!.publishedAt = '2026-03-09T15:00:00+08:00'
    const financial = input.financials.find(item => item.id === 'fin-net-profit')!
    financial.publishedAt = '2026-03-09T07:00:00Z'
    expect(explainDate(loadDataset(input), '2026-03-09').factors.map(factor => factor.id)).toContain('factor-earnings')
    financial.publishedAt = '2026-03-09T07:00:00.001Z'
    expect(explainDate(loadDataset(input), '2026-03-09').factors.map(factor => factor.id)).not.toContain('factor-earnings')
  })

  it('不把已发布但映射至其他日期的事件用于当前候选', () => {
    const input = loadDataset()
    input.factors[0].eventIds = ['evt-product']
    expect(explainDate(loadDataset(input), '2026-03-09').factors.map(factor => factor.id)).toEqual(['factor-industry'])
  })

  it('盘后公告不进入发布日的解释', () => {
    const input = loadDataset()
    input.factors.find(factor => factor.id === 'factor-earnings')!.tradingDate = '2026-03-06'
    expect(explainDate(loadDataset(input), '2026-03-06').factors).toEqual([])
  })

  it('先过滤再按优先级最多取 3 个，不依赖输入顺序', () => {
    const input = loadDataset()
    const template = input.factors[0]
    input.factors.find(factor => factor.id === 'factor-future-event')!.tradingDate = '2026-03-09'
    input.factors = [5, 3, 4].map(priority => ({ ...template, id: `extra-${priority}`, priority }))
      .concat([...input.factors].reverse())
    expect(explainDate(loadDataset(input), '2026-03-09').factors.map(factor => factor.id))
      .toEqual(['factor-earnings', 'factor-industry', 'extra-3'])
  })

  it('有行情但无合格因素时不补造，空事件也返回合法空结果', () => {
    expect(explainDate(loadDataset(), '2026-03-03')).toMatchObject({ status: 'no-factors', factors: [] })
    const input = loadDataset()
    input.events = []
    input.evidence = []
    input.factors = []
    expect(explainDate(loadDataset(input), '2026-03-09')).toMatchObject({ status: 'no-factors', factors: [] })
  })

  it('范围外、空行情和无法映射均不生成价格解释', () => {
    const input = loadDataset()
    input.factors[0] = { ...input.factors[0], tradingDate: '2026-03-30', eventIds: ['evt-outside'] }
    const dataset = loadDataset(input)
    expect(explainDate(dataset, '2026-03-30')).toMatchObject({ status: 'no-market-data', cutoff: null, factors: [] })
    input.candles = []
    expect(explainDate(loadDataset(input), '2026-03-09')).toMatchObject({ status: 'no-market-data', factors: [] })
    expect(explainDate(dataset, null)).toMatchObject({ status: 'unmapped', tradingDate: null, cutoff: null, factors: [] })
  })
})
