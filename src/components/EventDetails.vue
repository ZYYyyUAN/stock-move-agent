<script setup lang="ts">
import { computed } from 'vue'
import type { Dataset } from '../types'
import type { mapEvents } from '../domain/eventMapping'
import { assertionLabels, eventTypeLabels, mappingReasonLabels } from '../presentation'
const props = defineProps<{ dataset: Dataset; item: ReturnType<typeof mapEvents>[number] | null; evidenceId: string | null }>()
const emit = defineEmits<{ selectEvidence: [id: string] }>()
const source = computed(() => props.item ? props.dataset.sources.find(source => source.id === props.item!.event.sourceId)! : null)
const quotes = computed(() => props.item ? props.dataset.evidence.filter(quote => props.item!.event.evidenceIds.includes(quote.id)) : [])
const targetSection = computed(() => quotes.value.find(quote => quote.id === props.evidenceId)?.sectionId)
</script>
<template>
<section class="panel event-details"><h2>事件与证据</h2><template v-if="item && source">
<p>{{ assertionLabels[item.event.assertion] }} · {{ eventTypeLabels[item.event.type] }} · 时间相关性</p><h3>{{ item.event.title }}</h3>
<dl><dt>原始发布时间</dt><dd>{{ item.event.publishedAt }}</dd><dt>交易所时间</dt><dd>{{ item.mapping.exchangeDate }} {{ item.mapping.exchangeTime }}（{{ dataset.market.timezone }}）</dd><dt>映射交易日</dt><dd>{{ item.mapping.tradingDate ?? '暂无法映射' }}</dd><dt>映射原因</dt><dd>{{ mappingReasonLabels[item.mapping.reason] }}</dd><dt>模拟来源</dt><dd>{{ source.publisher }} · {{ source.title }}</dd></dl>
<p>{{ item.event.summary }}</p><div v-for="quote in quotes" :key="quote.id" :data-evidence-id="quote.id" :class="{target: quote.id === evidenceId}"><blockquote>{{ quote.quote }}</blockquote><button @click="emit('selectEvidence', quote.id)">定位来源原文 · {{ quote.sectionId }}</button></div>
<details :open="evidenceId !== null"><summary>来源原文（模拟）</summary><p>来源发布时间：{{ source.publishedAt }}</p><p v-for="section in source.sections" :key="section.sectionId" :class="{target: section.sectionId === targetSection}">{{ section.sectionId }} · {{ section.text }}</p></details>
</template><p v-else>当前交易日无可用事件，未选择事件详情。</p></section>
</template>
