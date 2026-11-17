<script setup lang="ts">
import type { Dataset } from '../types'
import type { Explanation } from '../domain/explain'
import { toExchangeTime } from '../domain/eventMapping'
const props = defineProps<{ dataset: Dataset; explanation: Explanation; expanded: boolean }>()
const emit = defineEmits<{ toggle: []; selectReference: [eventId: string, evidenceId: string | null] }>()
</script>
<template>
<section class="panel agent-assistant"><h2>Agent 解释 · {{ explanation.tradingDate ?? '未映射日期' }}</h2><button :aria-expanded="expanded" @click="emit('toggle')">{{ expanded ? '收起助手' : '展开助手' }}</button><div v-if="expanded">
<p v-if="explanation.cutoff">截至 {{ toExchangeTime(explanation.cutoff, dataset.market.timezone).date }} {{ toExchangeTime(explanation.cutoff, dataset.market.timezone).time }} 收盘（{{ dataset.market.timezone }}）</p>
<p v-if="explanation.status === 'no-factors'">当前日期没有可用因素，不补造解释。</p><p v-else-if="explanation.status !== 'ready'">缺少行情或映射日期，无法生成价格解释。</p>
<article v-for="factor in explanation.factors" :key="factor.id" :data-factor-id="factor.id"><p>{{ factor.relationship }} · {{ factor.verification }} · 置信度{{ factor.confidence }}</p><h3><button @click="emit('selectReference', factor.references[0].eventId, factor.references[0].evidenceIds[0] ?? null)">{{ factor.claim }}</button></h3><p>作用机制：{{ factor.mechanism }}</p><p>依据：{{ factor.confidenceReason }}</p>
<div v-for="reference in factor.references" :key="reference.eventId"><button :data-reference-event="reference.eventId" @click="emit('selectReference', reference.eventId, null)">{{ props.dataset.events.find(event => event.id === reference.eventId)!.title }}</button><button v-for="id in reference.evidenceIds" :key="id" :data-reference-evidence="id" @click="emit('selectReference', reference.eventId, id)">查看引文</button></div><p>局限：{{ factor.limitations.join(' ') }}</p></article>
<p>{{ explanation.temporalRelation }}：{{ explanation.limitation }}</p><p>固定候选与确定性规则 · 所有材料均为模拟</p></div></section>
</template>
