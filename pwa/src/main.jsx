import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { GLOBAL_CSS } from './lib/colors'

const styleTag = document.createElement('style')
styleTag.textContent = GLOBAL_CSS
document.head.appendChild(styleTag)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
