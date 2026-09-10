import React, { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useTooltips } from './TooltipProvider'

// Renders its popup into document.body via a portal, positioned from the
// trigger's actual on-screen coordinates — this is deliberate, not just a
// style choice: a normal CSS-absolute tooltip gets silently clipped by any
// ancestor with overflow:hidden (like a rounded card) or buried by a
// stacking-context/z-index fight with something else on the page. A portal
// sidesteps both problems entirely, since the popup no longer lives inside
// that ancestor's box at all.
export default function Tip({ tipKey, title, text, children, side = 'right' }) {
  const { isDismissed, dismiss, loaded, register, activeKey } = useTooltips() || {}
  const [hovering, setHovering] = useState(false)
  const [rect, setRect] = useState(null)
  const anchorRef = useRef(null)

  useEffect(() => {
    if (!register) return
    return register(tipKey)
  }, [tipKey, register])

  const dismissed = isDismissed?.(tipKey)
  const isActive = !dismissed && activeKey === tipKey
  const showPopup = isActive || hovering

  useLayoutEffect(() => {
    if (!showPopup || !anchorRef.current) return
    const update = () => setRect(anchorRef.current.getBoundingClientRect())
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [showPopup])

  if (!loaded) return children

  const trigger = (
    <span ref={anchorRef} className="relative inline-flex items-center gap-1.5">
      {children}
      {dismissed && (
        <span
          className="text-maroon-300 hover:text-maroon-500 cursor-help text-[10px] w-4 h-4 rounded-full border border-current grid place-items-center shrink-0"
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
        >
          i
        </span>
      )}
    </span>
  )

  return (
    <>
      {trigger}
      <AnimatePresence>
        {showPopup && rect && createPortal(
          <PopupCard key={tipKey} rect={rect} side={side} title={title} text={text} showDismiss={isActive} onDismiss={() => dismiss(tipKey)} />,
          document.body
        )}
      </AnimatePresence>
    </>
  )
}

function PopupCard({ rect, side, title, text, showDismiss, onDismiss }) {
  const gap = 10
  const style = { position: 'fixed', zIndex: 9999 }
  let arrowStyle = {}

  if (side === 'right') {
    style.left = rect.right + gap
    style.top = rect.top + rect.height / 2
    style.transform = 'translateY(-50%)'
    arrowStyle = { left: -6, top: '50%', transform: 'translateY(-50%)', borderWidth: '6px 6px 6px 0', borderColor: 'transparent #3D0B14 transparent transparent' }
  } else if (side === 'top') {
    style.left = rect.left + rect.width / 2
    style.bottom = window.innerHeight - rect.top + gap
    style.transform = 'translateX(-50%)'
    arrowStyle = { left: '50%', bottom: -6, transform: 'translateX(-50%)', borderWidth: '6px 6px 0 6px', borderColor: '#3D0B14 transparent transparent transparent' }
  } else {
    style.left = rect.left + rect.width / 2
    style.top = rect.bottom + gap
    style.transform = 'translateX(-50%)'
    arrowStyle = { left: '50%', top: -6, transform: 'translateX(-50%)', borderWidth: '0 6px 6px 6px', borderColor: 'transparent transparent #3D0B14 transparent' }
  }

  // keep it on-screen horizontally even if the trigger is near an edge
  const maxLeft = window.innerWidth - 260
  if (typeof style.left === 'number') style.left = Math.min(Math.max(style.left, 12), maxLeft)

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 24 }}
      style={style}
      className="w-64 bg-maroon-900 text-white rounded-xl shadow-card p-4"
    >
      <div style={{ position: 'absolute', width: 0, height: 0, borderStyle: 'solid', ...arrowStyle }} />
      {title && <p className="font-display text-sm font-semibold mb-1">{title}</p>}
      <p className="text-xs text-maroon-100 leading-relaxed">{text}</p>
      {showDismiss && (
        <button onClick={onDismiss} className="text-gold-300 hover:text-gold-200 text-xs font-medium mt-2.5">
          Got it
        </button>
      )}
    </motion.div>
  )
}