import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Box, type SxProps, type Theme } from '@mui/material'

// Long lists (a full Palbox is over 900 pals) only mount the rows near the visible part
type Watch = (el: Element, onChange: (near: boolean) => void) => () => void
const LazyContext = createContext<Watch | null>(null)

/** A scrolling box whose LazyItems mount only near the visible part */
export function LazyScroll({ children, sx }: { children: ReactNode; sx?: SxProps<Theme> }) {
	const root = useRef<HTMLDivElement>(null)
	const [watch, setWatch] = useState<Watch | null>(null)
	useEffect(() => {
		const callbacks = new WeakMap<Element, (near: boolean) => void>()
		const observer = new IntersectionObserver((entries) => entries.forEach((e) => callbacks.get(e.target)?.(e.isIntersecting)), {
			root: root.current,
			rootMargin: '800px 0px'
		})
		setWatch(() => (el: Element, onChange: (near: boolean) => void) => {
			callbacks.set(el, onChange)
			observer.observe(el)
			return () => {
				observer.unobserve(el)
				callbacks.delete(el)
			}
		})
		return () => observer.disconnect()
	}, [])
	return (
		<Box ref={root} sx={[{ flex: 1, overflowY: 'auto', minHeight: 0 }, ...(Array.isArray(sx) ? sx : [sx])]}>
			<LazyContext.Provider value={watch}>{children}</LazyContext.Provider>
		</Box>
	)
}

/** Holds a row's space while it's far from view; `estimate` is its height before it first shows */
export function LazyItem({ estimate, children }: { estimate: number; children: ReactNode }) {
	const ref = useRef<HTMLDivElement>(null)
	const watch = useContext(LazyContext)
	const [near, setNear] = useState(false)
	const height = useRef(estimate)
	useEffect(() => {
		const el = ref.current
		if (!el || !watch) return
		return watch(el, (on) => {
			// A hidden page measures 0; keep the last real height
			if (!on && el.offsetHeight) height.current = el.offsetHeight
			setNear(on)
		})
	}, [watch])
	return (
		<div ref={ref} style={near ? undefined : { height: height.current }}>
			{near && children}
		</div>
	)
}
