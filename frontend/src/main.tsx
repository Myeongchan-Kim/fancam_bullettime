import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { API_BASE_URL } from './constants'

console.log(`%c🚀 API Connection: ${API_BASE_URL}`, 'color: #FF1988; font-weight: bold; font-size: 12px;');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
