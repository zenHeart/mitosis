<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from './stores/auth'
import LoginPage from './components/LoginPage.vue'
import SetupPage from './components/SetupPage.vue'
import Workspace from './components/Workspace.vue'
import Gallery from './components/Gallery.vue'

const authStore = useAuthStore()
const currentView = ref<'gallery' | 'login' | 'setup' | 'workspace'>('gallery')

const view = computed(() => currentView.value)

// Detect if we're viewing a specific app (from 404.html redirect with ?app= param)
const initialApp = computed(() => {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search)
    return params.get('app') || undefined
  }
  return undefined
})

onMounted(async () => {
  await authStore.init()
  if (authStore.isAuthenticated) {
    if (authStore.setupComplete) {
      currentView.value = 'workspace'
    } else {
      currentView.value = 'setup'
    }
  } else {
    // Anonymous users see the public gallery
    currentView.value = 'gallery'
  }
})

function onLoginSuccess() {
  if (authStore.setupComplete) {
    currentView.value = 'workspace'
  } else {
    currentView.value = 'setup'
  }
}

function onSetupComplete() {
  authStore.setSetupComplete()
  currentView.value = 'workspace'
}
</script>

<template>
  <Gallery v-if="view === 'gallery'" :initial-app="initialApp" />
  <LoginPage v-else-if="view === 'login'" @login-success="onLoginSuccess" />
  <SetupPage v-else-if="view === 'setup'" @complete="onSetupComplete" />
  <Workspace v-else />
</template>
