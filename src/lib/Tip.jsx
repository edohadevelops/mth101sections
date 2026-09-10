import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTooltips } from './TooltipProvider'

// Dark popover-style tooltip with a bold title, lighter description, and a
// small pointer arrow connecting it to the trigger — same shape as a
// classic "onboarding coach mark." Shows automatically (title required)
// until dismissed via "Got it," then collapses to a small (i) icon that
// reveals the same content on hover. Dismissal persists per-person.
export default function Tip({ tipKey, title, text, children, side = 'right' }) {
  const { isDismissed, dismiss, loaded } = useTooltips() || {}
  const [hovering, setHovering] = useState(false)

  if (!loaded) return children
  const dismissed = isDismissed?.(tipKey)

  const sideClasses = {
    right: { box: 'left-full ml-3 top-1/2 -translate-y-1/2', arrow: 'right-full top-1/2 -translate-y-1/2 border-r-maroon-900 border-t-transparent border-b-transparent border-l-transparent' },
    bottom: { box: 'top-full mt-3 left-1/2 -translate-x-1/2', arrow: 'bottom-full left-1/2 -translate-x-1/2 border-b-maroon-900 border-l-transparent border-r-transparent border-t-transparent' },
    top: { box: 'bottom-full mb-3 left-1/2 -translate-x-1/2', arrow: 'top-full left-1/2 -translate-x-1/2 border-t-maroon-900 border-l-transparent border-r-transparent border-b-transparent' },
  }[side]

  const Card = ({ compact }) => (
    <div className={`absolute ${sideClasses.box} z-30 w-64 bg-maroon-900 text-white rounded-xl shadow-card p-4`}>
      <div className={`absolute w-0 h-0 border-[7px] ${sideClasses.arrow}`} />
      {title && <p className="font-display text-sm font-semibold mb-1">{title}</p>}
      <p className="text-xs text-maroon-100 leading-relaxed">{text}</p>
      {!compact && (
        <button onClick={() => dismiss(tipKey)} className="text-gold-300 hover:text-gold-200 text-xs font-medium mt-2.5">
          Got it
        </button>
      )}
    </div>
  )

  if (!dismissed) {
    return (
      <span className="relative inline-block">
        {children}
        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 22 }}>
          <Card />
        </motion.div>
      </span>
    )
  }

  return (
    <span className="relative inline-flex items-center gap-1.5">
      {children}
      <span
        className="relative text-maroon-300 hover:text-maroon-500 cursor-help text-[10px] w-4 h-4 rounded-full border border-current grid place-items-center shrink-0"
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
      >
        i
        <AnimatePresence>
          {hovering && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <Card compact />
            </motion.div>
          )}
        </AnimatePresence>
      </span>
    </span>
  )
}
