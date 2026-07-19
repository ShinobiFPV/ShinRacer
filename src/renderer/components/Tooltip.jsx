import { createContext, useContext, useState, useRef, useLayoutEffect } from 'react'
import { C } from './primitives'

const TooltipContext = createContext(null)
export const useTooltip = () => useContext(TooltipContext)

const ARROW = 6
const GAP = 8
const EDGE_MARGIN = 8

// Decides final side (auto-flipping away from viewport edges) and the x/y
// of the tooltip box, plus where along that box the arrow should sit so it
// still points at the target's center even after the box gets edge-clamped.
function computePlacement(rect, preferred, size) {
  const tw = size.width, th = size.height
  let pos = preferred
  const spaceTop = rect.top
  const spaceBottom = window.innerHeight - rect.bottom
  const spaceLeft = rect.left
  const spaceRight = window.innerWidth - rect.right
  const neededV = th + GAP + EDGE_MARGIN
  const neededH = tw + GAP + EDGE_MARGIN

  if (pos === 'top' && spaceTop < neededV && spaceBottom > spaceTop) pos = 'bottom'
  else if (pos === 'bottom' && spaceBottom < neededV && spaceTop > spaceBottom) pos = 'top'
  else if (pos === 'left' && spaceLeft < neededH && spaceRight > spaceLeft) pos = 'right'
  else if (pos === 'right' && spaceRight < neededH && spaceLeft > spaceRight) pos = 'left'

  let x, y
  if (pos === 'top')         { x = rect.left + rect.width / 2 - tw / 2; y = rect.top - th - GAP }
  else if (pos === 'bottom') { x = rect.left + rect.width / 2 - tw / 2; y = rect.bottom + GAP }
  else if (pos === 'left')   { x = rect.left - tw - GAP; y = rect.top + rect.height / 2 - th / 2 }
  else                       { x = rect.right + GAP; y = rect.top + rect.height / 2 - th / 2 }

  const cx = Math.max(EDGE_MARGIN, Math.min(x, window.innerWidth - tw - EDGE_MARGIN))
  const cy = Math.max(EDGE_MARGIN, Math.min(y, window.innerHeight - th - EDGE_MARGIN))

  const arrowX = pos === 'top' || pos === 'bottom'
    ? Math.max(ARROW * 2, Math.min(rect.left + rect.width / 2 - cx, tw - ARROW * 2))
    : tw / 2
  const arrowY = pos === 'left' || pos === 'right'
    ? Math.max(ARROW * 2, Math.min(rect.top + rect.height / 2 - cy, th - ARROW * 2))
    : th / 2

  return { pos, x: cx, y: cy, arrowX, arrowY }
}

function arrowStyle(placement) {
  const base = { position: 'absolute', width: 0, height: 0 }
  switch (placement.pos) {
    case 'top':    return { ...base, left: placement.arrowX - ARROW, bottom: -ARROW, borderLeft: `${ARROW}px solid transparent`, borderRight: `${ARROW}px solid transparent`, borderTop: `${ARROW}px solid ${C.overlay}` }
    case 'bottom': return { ...base, left: placement.arrowX - ARROW, top: -ARROW, borderLeft: `${ARROW}px solid transparent`, borderRight: `${ARROW}px solid transparent`, borderBottom: `${ARROW}px solid ${C.overlay}` }
    case 'left':   return { ...base, top: placement.arrowY - ARROW, right: -ARROW, borderTop: `${ARROW}px solid transparent`, borderBottom: `${ARROW}px solid transparent`, borderLeft: `${ARROW}px solid ${C.overlay}` }
    default:       return { ...base, top: placement.arrowY - ARROW, left: -ARROW, borderTop: `${ARROW}px solid transparent`, borderBottom: `${ARROW}px solid transparent`, borderRight: `${ARROW}px solid ${C.overlay}` }
  }
}

export function TooltipProvider({ children }) {
  const [tooltip, setTooltip] = useState(null) // { text, rect, position }
  const [placement, setPlacement] = useState(null)
  const [shown, setShown] = useState(false)
  const boxRef = useRef(null)

  const showTooltip = (text, rect, position = 'top') => {
    setPlacement(null)
    setShown(false)
    setTooltip({ text, rect, position })
  }
  const hideTooltip = () => {
    setTooltip(null)
    setPlacement(null)
    setShown(false)
  }

  useLayoutEffect(() => {
    if (!tooltip || !boxRef.current) return
    const size = boxRef.current.getBoundingClientRect()
    setPlacement(computePlacement(tooltip.rect, tooltip.position, { width: size.width, height: size.height }))
    const raf = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(raf)
  }, [tooltip])

  return (
    <TooltipContext.Provider value={{ showTooltip, hideTooltip }}>
      {children}
      {tooltip && (
        <div ref={boxRef}
          style={{
            position: 'fixed',
            top: placement ? placement.y : -9999,
            left: placement ? placement.x : -9999,
            zIndex: 9999,
            background: C.overlay,
            border: `1px solid ${C.borderHi}`,
            borderRadius: 8,
            padding: '5px 10px',
            fontSize: 11,
            lineHeight: 1.4,
            color: C.textSec,
            fontFamily: C.body,
            maxWidth: 220,
            textAlign: 'center',
            pointerEvents: 'none',
            opacity: shown ? 1 : 0,
            transition: 'opacity .15s ease',
          }}>
          {tooltip.text}
          {placement && <span style={arrowStyle(placement)} />}
        </div>
      )}
    </TooltipContext.Provider>
  )
}

// Wraps a single child, showing a floating tooltip on hover. The wrapper is
// `display:contents` so it never affects the child's layout (flex/grid
// sizing on the child passes straight through as if this wrapper weren't
// there); positioning is read from the actual hovered DOM node (e.avatar.target)
// rather than the wrapper itself, since display:contents elements report an
// empty bounding rect.
export default function Tooltip({ text, position = 'top', delay = 400, disabled, children }) {
  const ctx = useTooltip()
  const timerRef = useRef(null)

  if (!text || disabled || !ctx) return children

  const { showTooltip, hideTooltip } = ctx

  const handleEnter = (e) => {
    const node = e.target
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      if (!node.isConnected) return
      showTooltip(text, node.getBoundingClientRect(), position)
    }, delay)
  }
  const handleLeave = () => {
    clearTimeout(timerRef.current)
    hideTooltip()
  }

  return (
    <span onMouseEnter={handleEnter} onMouseLeave={handleLeave} style={{ display: 'contents' }}>
      {children}
    </span>
  )
}
