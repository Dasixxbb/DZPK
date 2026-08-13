import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'
import Lobby from './views/Lobby.vue'
import Room from './views/Room.vue'
import './assets/style.css'
import { loadClientConfig } from './utils/config.js'

async function bootstrap() {
  await loadClientConfig()

  const router = createRouter({
    history: createWebHashHistory(),
    routes: [
      { path: '/', component: Lobby },
      { path: '/room/:roomId', component: Room, props: true }
    ]
  })

  createApp(App).use(router).mount('#app')
}

bootstrap()
