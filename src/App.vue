<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from './stores/auth'
import { useDarkMode } from './composables/useDarkMode'
import LoginPage from './components/LoginPage.vue'
import SetupPage from './components/SetupPage.vue'
import Workspace from './components/Workspace.vue'
import Gallery from './components/Gallery.vue'

const authStore = useAuthStore()
const currentView = ref<'gallery' | 'login' | 'setup' | 'workspace'>('gallery')
const { init: initDarkMode } = useDarkMode()

const view = computed(() => currentView.value)

// Detect if current URL is an app path: /apps/{name}/v{n}/...
const isAppPath = computed(() => {
  if (typeof window !== 'undefined') {
    return /^\/apps\/[^/]+\/v\d+/i.test((window as any).location.pathname)
  }
  return false
})

// Detect if we're viewing a specific app (from 404.html redirect with ?app= param)
const initialApp = computed(() => {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams((window as any).location.search)
    return params.get('app') || undefined
  }
  return undefined
})

onMounted(async () => {
  initDarkMode()
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

function onBrowsePublic() {
  currentView.value = 'gallery'
}

const appIframeSrc = computed(() => {
  if (typeof window !== 'undefined') {
    return (window as any).location.pathname
  }
  return ''
})
</script>

<template>
  <!-- App viewer: Gallery for anonymous/gallery view, Workspace for authenticated -->
  <Gallery v-if="view === 'gallery'" :initial-app="initialApp" />
  <LoginPage v-else-if="view === 'login'" @login-success="onLoginSuccess" />
  <SetupPage
    v-else-if="view === 'setup'"
    :user-name="authStore.user?.login"
    @complete="onSetupComplete"
    @browse="onBrowsePublic"
  />
  <!-- Workspace always visible for sidebar; iframe overlay for app viewing -->
  <div v-if="view === 'workspace'" style="position: relative; width: 100%; height: 100vh;">
    <Workspace />
    <iframe
      v-if="isAppPath"
      :src="appIframeSrc"
      style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; border: none; z-index: 1000; background: #0a0a1a;"
    />
  </div>
</template>
