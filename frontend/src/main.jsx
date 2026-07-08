import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { I18nProvider } from './context/I18nContext.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import 'leaflet/dist/leaflet.css'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <I18nProvider>
    <AuthProvider>
      <App />
    </AuthProvider>
  </I18nProvider>
)
