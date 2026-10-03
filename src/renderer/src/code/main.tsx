import './apiBase'
import { createRoot } from 'react-dom/client'
import { App } from '../../../../parts/ackemcode/src/client/App'
import '../../../../parts/ackemcode/src/client/styles.css'

const root = document.getElementById('root')
if (root) createRoot(root).render(<App />)
