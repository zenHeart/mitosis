<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from './stores/auth'
import LoginPage from './components/LoginPage.vue'
import SetupPage from './components/SetupPage.vue'
import Workspace from './components/Workspace.vue'

const authStore = useAuthStore()
const currentView = ref<'login' | 'setup' | 'workspace'>('login')

const view = computed(() => currentView.value)

onMounted(async () => {
  await authStore.init()
  if (authStore.isAuthenticated) {
    if (authStore.setupComplete) {
      currentView.value = 'workspace'
    } else {
      currentView.value = 'setup'
    }
  } else {
    currentView.value = 'login'
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
  <LoginPage v-if="view === 'login'" @login-success="onLoginSuccess" />
  <SetupPage v-else-if="view === 'setup'" @complete="onSetupComplete" />
  <Workspace v-else />
</template>
