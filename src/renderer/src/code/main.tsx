import './apiBase'
import { createRoot } from 'react-dom/client'
import { App } from '../../../../ackemcode/src/client/App'
import '../../../../ackemcode/src/client/styles.css'

const root = document.getElementById('root')
if (root) createRoot(root).render(<App />)
