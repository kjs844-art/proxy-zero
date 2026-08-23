import './styles.css'
import { createGame } from './app/createGame'

const app = document.querySelector<HTMLDivElement>('#app')

if (app === null) {
  throw new Error('PROXY ZERO game container is missing.')
}

void createGame(app)
