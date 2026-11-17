<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { mapEvents } from '../domain/eventMapping'
import { assertionLabels, eventTypeLabels } from '../presentation'
const props = defineProps<{ items: ReturnType<typeof mapEvents>; selectedDate: string | null; selectedEventId: string | null }>()
const emit = defineEmits<{ selectEvent: [id: string] }>()
const list = ref<HTMLElement>()
const groups = computed(() => [...new Set([...props.items.map(item => item.mapping.tradingDate), props.selectedDate])].sort((a,b) => (a ?? 'z').localeCompare(b ?? 'z')).map(date => ({ date, items: props.items.filter(item => item.mapping.tradingDate === date) })))
watch(() => [props.selectedDate, props.selectedEventId], () => list.value?.querySelector('[aria-pressed="true"], [data-selected="true"]')?.scrollIntoView({ block: 'nearest' }), { flush: 'post' })
</script>
<template>
<section class="panel"><h2>事件时间线</h2><p>按映射交易日分组 · 时间相关性</p><div ref="list" class="timeline-list">
<section v-for="group in groups" :key="group.date ?? 'unmapped'" :data-selected="group.date === selectedDate"><h3>{{ group.date ?? '未映射事件' }}</h3><p v-if="!group.items.length">当前交易日无可用事件。</p>
<button v-for="item in group.items" :key="item.event.id" class="timeline-event" :data-event-id="item.event.id" :aria-pressed="item.event.id === selectedEventId" @click="emit('selectEvent', item.event.id)">{{ assertionLabels[item.event.assertion] }} · {{ eventTypeLabels[item.event.type] }} · {{ item.mapping.exchangeDate }} {{ item.mapping.exchangeTime }}<br>{{ item.event.title }}</button>
</section></div></section>
</template>
