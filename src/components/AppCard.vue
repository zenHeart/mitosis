<script setup lang="ts">
import type { AppInfo } from '../types/app'

defineProps<{
  app: AppInfo
}>()
</script>

<template>
  <div class="app-card">
    <div class="app-info">
      <span class="app-name">{{ app.name }}</span>
      <span class="app-version">v{{ app.latestVersion }}</span>
    </div>
    <a :href="app.url" target="_blank" rel="noopener" class="open-link">
      打开
    </a>
  </div>
</template>

<style scoped>
.app-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.6rem 0.5rem;
  border-radius: 6px;
  transition: background 0.15s;
}

.app-card:hover {
  background: var(--bg-tertiary);
}

.app-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

.app-name {
  font-size: 0.85rem;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-version {
  font-size: 0.7rem;
  color: var(--text-secondary);
  background: var(--bg-primary);
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  flex-shrink: 0;
}

.open-link {
  font-size: 0.75rem;
  color: var(--accent);
  flex-shrink: 0;
}
</style>
