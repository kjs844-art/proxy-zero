import './styles.css'
import { createGame } from './app/createGame'

const app = document.querySelector<HTMLDivElement>('#app')

if (app === null) {
  throw new Error('PROXY ZERO game container is missing.')
}

void createGame(app).then((game) => {
  const isLoopback = ['127.0.0.1', 'localhost', '::1'].includes(window.location.hostname)
  const balanceObserverRequested =
    import.meta.env.PROD &&
    isLoopback &&
    new URLSearchParams(window.location.search).get('qa') === 'balance'

  if (balanceObserverRequested) {
    Object.defineProperty(window, '__PZ_BALANCE_BUILD__', {
      configurable: false,
      enumerable: false,
      value: Object.freeze({
        commit: __PZ_BUILD_COMMIT__,
        dirty: __PZ_BUILD_DIRTY__,
      }),
      writable: false,
    })
    Object.defineProperty(window, '__PZ_BALANCE_GAME__', {
      configurable: false,
      enumerable: false,
      value: game,
      writable: false,
    })
  }
})
