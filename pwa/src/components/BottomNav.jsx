import { NavLink } from 'react-router-dom'
import { C } from '../lib/colors'
import './BottomNav.css'

const ITEMS = [
  { path: '/events', icon: '📅', label: 'Events' },
  { path: '/comms', icon: '🎙️', label: 'Comms' },
  { path: '/mods', icon: '📦', label: 'Mods' },
  { path: '/stats', icon: '📊', label: 'Stats' },
  { path: '/settings', icon: '⚙️', label: 'Settings' },
]

export default function BottomNav() {
  return (
    <nav className="shr-nav">
      {ITEMS.map(item => (
        <NavLink
          key={item.path}
          to={item.path}
          className={({ isActive }) => `shr-nav-item${isActive ? ' active' : ''}`}
          style={({ isActive }) => ({
            color: isActive ? C.blue : C.muted,
            borderTopColor: isActive ? C.blue : 'transparent',
          })}
        >
          <span className="shr-nav-icon">{item.icon}</span>
          <span className="shr-nav-label">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
