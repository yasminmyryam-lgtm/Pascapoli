import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { initAdSdk } from './ads/adService'
import './index.css'

void initAdSdk()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
