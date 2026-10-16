import { memo, useMemo, useState } from 'react'
import {
	Box,
	Button,
	ButtonBase,
	Chip,
	IconButton,
	InputAdornment,
	InputBase,
	Paper,
	Tab,
	Tabs,
	TextField,
	Tooltip,
	Typography
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import AddIcon from '@mui/icons-material/Add'
import RemoveIcon from '@mui/icons-material/Remove'
import CloseIcon from '@mui/icons-material/Close'
import CheckIcon from '@mui/icons-material/Check'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd'
import ItemIcon from '@mui/icons-material/Inventory2Outlined'
import {
	breakdown,
	DEFAULT_BASIC,
	getRecipe,
	iconPath,
	ITEM_GROUPS,
	materialName,
	RARITY_COLOR,
	recipes,
	STRUCTURE_CATEGORIES,
	tierOf,
	type Rarity,
	type Recipe
} from '../data/recipes'
import { defaultCraft, useStore } from '../state/store'

const asset = (file: string) => `${import.meta.env.BASE_URL}${file}`
type Tab = 'All' | (typeof ITEM_GROUPS)[number] | 'Structures'
const NEUTRAL = '#8a93a6'

/** An item's or structure's icon; a plain box for the few the game data has no picture for */
function Icon({ id, size }: { id: string; size: number }) {
	const path = iconPath(id)
	const [broken, setBroken] = useState(false)
	if (!path || broken) {
		return (
			<Box sx={{ width: size, height: size, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'text.disabled' }}>
				<ItemIcon sx={{ fontSize: size * 0.6 }} />
			</Box>
		)
	}
	return <img src={asset(path)} alt="" width={size} height={size} loading="lazy" onError={() => setBroken(true)} style={{ objectFit: 'contain', flexShrink: 0 }} />
}

const tierColor = (r: Recipe) => (r.group === 'Structure' ? NEUTRAL : RARITY_COLOR[r.tiers[0].rarity ?? 'Common'])

// ---- The grid ----

const Tile = memo(function Tile({ recipe, selected, onPick }: { recipe: Recipe; selected: boolean; onPick: (id: string) => void }) {
	const color = tierColor(recipe)
	return (
		<Tooltip title={recipe.name} enterDelay={600}>
			<ButtonBase
				onClick={() => onPick(recipe.id)}
				sx={{
					display: 'flex',
					flexDirection: 'column',
					gap: 0.5,
					p: 1,
					borderRadius: 1.5,
					border: 1,
					borderColor: selected ? 'primary.main' : 'divider',
					bgcolor: selected ? 'action.selected' : 'rgba(255,255,255,0.03)',
					background: selected ? undefined : `linear-gradient(to top, ${color}1f, transparent 55%)`,
					'&:hover': { borderColor: selected ? 'primary.main' : 'rgba(255,255,255,0.2)' }
				}}
			>
				<Icon id={recipe.id} size={52} />
				<Typography
					variant="caption"
					fontWeight={600}
					sx={{ lineHeight: 1.2, textAlign: 'center', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: '2.4em' }}
				>
					{recipe.name}
				</Typography>
			</ButtonBase>
		</Tooltip>
	)
})

// ---- The selected recipe ----

function QuantityField({ value, onChange, width = 88 }: { value: number; onChange: (n: number) => void; width?: number }) {
	return (
		<TextField
			size="small"
			type="number"
			value={value}
			onChange={(e) => onChange(Math.max(1, Math.min(9999, Math.floor(Number(e.target.value) || 1))))}
			slotProps={{ htmlInput: { min: 1, style: { textAlign: 'center' } } }}
			sx={{ width, '& input': { py: 0.75 } }}
		/>
	)
}

function Detail({ recipe }: { recipe: Recipe }) {
	const { addToChecklist } = useStore()
	const [rarity, setRarity] = useState<Rarity | null>(recipe.tiers[0].rarity)
	const [qty, setQty] = useState(1)
	const tiered = recipe.tiers.length > 1
	const tier = tierOf(recipe, tiered ? rarity : recipe.tiers[0].rarity)
	const makes = recipe.makes ?? 1
	const crafts = Math.ceil(qty / makes)
	const color = recipe.group === 'Structure' ? NEUTRAL : RARITY_COLOR[tier.rarity ?? 'Common']

	return (
		<Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, p: 2 }}>
			<Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
				<Box sx={{ width: 88, height: 88, borderRadius: 2, border: `2px solid ${color}`, background: `radial-gradient(circle, ${color}2e, transparent 70%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
					<Icon id={recipe.id} size={68} />
				</Box>
				<Box sx={{ minWidth: 0 }}>
					<Typography variant="h6" lineHeight={1.2}>
						{recipe.name}
					</Typography>
					<Box sx={{ display: 'flex', gap: 0.5, mt: 0.75, flexWrap: 'wrap' }}>
						<Chip size="small" variant="outlined" label={recipe.category ?? recipe.group} />
						{recipe.tech != null && <Chip size="small" variant="outlined" label={`Technology ${recipe.tech}`} />}
					</Box>
				</Box>
			</Box>
			{recipe.description && (
				<Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-line' }}>
					{recipe.description}
				</Typography>
			)}
			{tiered && (
				<Box>
					<Typography variant="overline" color="text.secondary">
						Blueprint
					</Typography>
					<Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
						{recipe.tiers.map((t) => (
							<ButtonBase
								key={t.rarity}
								onClick={() => setRarity(t.rarity)}
								sx={{
									px: 1.25,
									py: 0.5,
									borderRadius: 1.5,
									border: 1,
									fontSize: 13,
									fontWeight: 700,
									color: RARITY_COLOR[t.rarity ?? 'Common'],
									borderColor: tier.rarity === t.rarity ? RARITY_COLOR[t.rarity ?? 'Common'] : 'divider',
									bgcolor: tier.rarity === t.rarity ? `${RARITY_COLOR[t.rarity ?? 'Common']}22` : 'transparent'
								}}
							>
								{t.rarity}
							</ButtonBase>
						))}
					</Box>
				</Box>
			)}
			{recipe.stations?.length ? (
				<Box>
					<Typography variant="overline" color="text.secondary">
						Crafted At
					</Typography>
					<Typography variant="body2">{recipe.stations.join(', ')}</Typography>
				</Box>
			) : null}
			<Box>
				<Box sx={{ display: 'flex', alignItems: 'baseline' }}>
					<Typography variant="overline" color="text.secondary" sx={{ flex: 1 }}>
						{recipe.group === 'Structure' ? 'Build Cost' : 'Ingredients'}
					</Typography>
					{makes > 1 && (
						<Typography variant="caption" color="text.secondary">
							Makes {makes} per craft
						</Typography>
					)}
				</Box>
				{tier.materials.map((m) => (
					<Box key={m.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, py: 0.5, borderBottom: 1, borderColor: 'divider' }}>
						<Icon id={m.id} size={30} />
						<Typography variant="body2" sx={{ flex: 1 }}>
							{materialName(m.id)}
						</Typography>
						<Typography variant="body2" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }}>
							{m.qty * crafts}
						</Typography>
					</Box>
				))}
			</Box>
			<Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
				<IconButton size="small" onClick={() => setQty((q) => Math.max(1, q - 1))}>
					<RemoveIcon fontSize="small" />
				</IconButton>
				<QuantityField value={qty} onChange={setQty} />
				<IconButton size="small" onClick={() => setQty((q) => q + 1)}>
					<AddIcon fontSize="small" />
				</IconButton>
				<Button variant="contained" startIcon={<PlaylistAddIcon />} onClick={() => addToChecklist(recipe.id, tiered ? tier.rarity : null, qty)} sx={{ flex: 1 }}>
					Add to Checklist
				</Button>
			</Box>
		</Box>
	)
}

// ---- The checklist ----

/** How many you have out of how many the list needs; the first number is typed in */
function Fraction({ have, need, onChange }: { have: number; need: number; onChange: (n: number) => void }) {
	const done = have >= need
	return (
		<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontVariantNumeric: 'tabular-nums', color: done ? 'success.main' : 'text.primary' }}>
			<InputBase
				value={have || ''}
				placeholder="0"
				onChange={(e) => onChange(Math.min(999999, Math.floor(Number(e.target.value.replace(/[^0-9]/g, '')) || 0)))}
				onFocus={(e) => e.target.select()}
				inputProps={{ inputMode: 'numeric', 'aria-label': 'How many you have' }}
				sx={{
					width: 58,
					fontSize: 14,
					fontWeight: 700,
					color: 'inherit',
					borderRadius: 1,
					bgcolor: 'rgba(255,255,255,0.05)',
					'& input': { textAlign: 'right', px: 0.75, py: 0.25 },
					'&.Mui-focused': { outline: 1, outlineColor: 'primary.main' }
				}}
			/>
			<Typography variant="body2" fontWeight={700} sx={{ color: 'inherit', minWidth: 52 }}>
				/ {need.toLocaleString()}
			</Typography>
		</Box>
	)
}

function Checklist({ onPick }: { onPick: (id: string) => void }) {
	const { craft, updateCraft } = useStore()
	const result = useMemo(() => breakdown(craft.list, craft.basic, craft.have), [craft.list, craft.basic, craft.have])
	const setQty = (key: string, qty: number) => updateCraft({ list: craft.list.map((e) => (e.key === key ? { ...e, qty } : e)) })
	const setHave = (key: string, n: number) => {
		const have = { ...craft.have }
		if (n > 0) have[key] = n
		else delete have[key]
		updateCraft({ have })
	}
	// Having all of a step makes it a basic material you already have, so its ingredients drop out
	const haveAll = (key: string, id: string, qty: number) => {
		const onList = craft.list.some((e) => e.key === key)
		updateCraft({ have: { ...craft.have, [key]: qty }, basic: onList || craft.basic.includes(id) ? craft.basic : [...craft.basic, id] })
	}
	// Having none of a crafted material puts it back into the crafting steps
	const haveNone = (id: string) => {
		const { [id]: _gone, ...have } = craft.have
		updateCraft({ have, basic: craft.basic.filter((b) => b !== id) })
	}
	const changed = Object.keys(craft.have).length > 0 || craft.basic.length !== DEFAULT_BASIC.length || craft.basic.some((b) => !DEFAULT_BASIC.includes(b))

	if (!craft.list.length) {
		return (
			<Typography variant="body2" color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>
				Add recipes and structures to see every basic material they take.
			</Typography>
		)
	}
	return (
		<Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
			<Box>
				{craft.list.map((e) => {
					const r = getRecipe(e.id)!
					return (
						<Box key={e.key} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5, borderBottom: 1, borderColor: 'divider' }}>
							<ButtonBase onClick={() => onPick(e.id)} sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 0, justifyContent: 'flex-start', borderRadius: 1 }}>
								<Icon id={e.id} size={30} />
								<Box sx={{ minWidth: 0, textAlign: 'left' }}>
									<Typography variant="body2" fontWeight={600} noWrap>
										{r.name}
									</Typography>
									{e.rarity && (
										<Typography variant="caption" fontWeight={700} sx={{ color: RARITY_COLOR[e.rarity] }}>
											{e.rarity}
										</Typography>
									)}
								</Box>
							</ButtonBase>
							<QuantityField value={e.qty} onChange={(n) => setQty(e.key, n)} width={72} />
							<IconButton size="small" onClick={() => updateCraft({ list: craft.list.filter((x) => x.key !== e.key) })}>
								<CloseIcon fontSize="small" />
							</IconButton>
						</Box>
					)
				})}
			</Box>

			<Box>
				<Box sx={{ display: 'flex', alignItems: 'center' }}>
					<Typography variant="overline" color="text.secondary" sx={{ flex: 1 }}>
						Basic Materials
					</Typography>
					<Tooltip title="Set Every Count to 0 and Break Every Crafted Material Back Down">
						<span>
							<Button size="small" startIcon={<RestartAltIcon />} disabled={!changed} onClick={() => updateCraft({ have: {}, basic: DEFAULT_BASIC })}>
								Reset
							</Button>
						</span>
					</Tooltip>
				</Box>
				{result.basic.map((m) => {
					const craftable = !!getRecipe(m.id) && getRecipe(m.id)!.group !== 'Structure'
					return (
						<Box key={m.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, py: 0.5, borderBottom: 1, borderColor: 'divider' }}>
							<Icon id={m.id} size={30} />
							<Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>
								{materialName(m.id)}
							</Typography>
							<Fraction have={m.have} need={m.qty} onChange={(n) => setHave(m.id, n)} />
							{craftable ? (
								<Tooltip title="Have None, Craft Them">
									<IconButton size="small" onClick={() => haveNone(m.id)} sx={{ color: 'error.main' }}>
										<CloseIcon fontSize="small" />
									</IconButton>
								</Tooltip>
							) : (
								<Box sx={{ width: 30, flexShrink: 0 }} />
							)}
						</Box>
					)
				})}
			</Box>

			{result.crafts.length > 0 && (
				<Box>
					<Typography variant="overline" color="text.secondary">
						Crafting Steps
					</Typography>
					{result.crafts.map((c) => {
						const r = getRecipe(c.id)
						const station = r?.stations?.[0]
						return (
							<Box key={c.key} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, py: 0.5, borderBottom: 1, borderColor: 'divider' }}>
								{/* Steps that need other crafts done first sit further in */}
								{c.level > 0 && (
									<Box sx={{ width: c.level * 20, flexShrink: 0, alignSelf: 'stretch', display: 'flex', justifyContent: 'flex-end', my: -0.5 }}>
										<Box sx={{ width: 2, mr: 0.75, bgcolor: 'divider' }} />
									</Box>
								)}
								<Icon id={c.id} size={30} />
								<Box sx={{ flex: 1, minWidth: 0 }}>
									<Typography variant="body2" noWrap>
										{materialName(c.id)}
									</Typography>
									{(c.rarity || station) && (
										<Typography variant="caption" color="text.secondary" noWrap component="div">
											{c.rarity && (
												<Box component="span" sx={{ color: RARITY_COLOR[c.rarity], fontWeight: 700, mr: station ? 0.75 : 0 }}>
													{c.rarity}
												</Box>
											)}
											{station}
										</Typography>
									)}
								</Box>
								<Tooltip title={c.crafts > 0 && c.makes > 1 ? `${c.crafts} crafts of ${c.makes}` : ''}>
									<span>
										<Fraction have={c.have} need={c.qty} onChange={(n) => setHave(c.key, n)} />
									</span>
								</Tooltip>
								<Tooltip title="Have All of These">
									<IconButton size="small" onClick={() => haveAll(c.key, c.id, c.qty)} sx={{ color: c.have >= c.qty ? 'success.main' : undefined }}>
										<CheckIcon fontSize="small" />
									</IconButton>
								</Tooltip>
							</Box>
						)
					})}
				</Box>
			)}
		</Box>
	)
}

// ---- Page ----

export function RecipesPage() {
	const { craft, updateCraft } = useStore()
	const [tab, setTab] = useState<Tab>('All')
	const [category, setCategory] = useState<string>('All')
	const [search, setSearch] = useState('')
	const [selected, setSelected] = useState<string | null>(null)

	const shown = useMemo(() => {
		const q = search.trim().toLowerCase()
		return recipes
			.filter((r) =>
				tab === 'Structures'
					? r.group === 'Structure' && (category === 'All' || r.category === category)
					: r.group !== 'Structure' && (tab === 'All' || r.group === tab)
			)
			.filter((r) => !q || r.name.toLowerCase().includes(q))
			.sort((a, b) => (a.tech ?? 999) - (b.tech ?? 999) || a.name.localeCompare(b.name))
	}, [tab, category, search])

	const recipe = selected ? getRecipe(selected) : null
	const pick = (id: string) => {
		const r = getRecipe(id)
		if (!r) return
		setSelected(id)
	}

	return (
		<Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(340px, 1fr) 360px 500px', gap: 2, height: '100%', minHeight: 0 }}>
			<Paper variant="outlined" sx={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
				<Tabs
					value={tab}
					onChange={(_, v) => setTab(v)}
					variant="scrollable"
					scrollButtons={false}
					sx={{ px: 0.5, borderBottom: 1, borderColor: 'divider', '& .MuiTab-root': { minWidth: 0, px: 1.5 } }}
				>
					{(['All', ...ITEM_GROUPS, 'Structures'] as Tab[]).map((t) => (
						<Tab key={t} value={t} label={t} />
					))}
				</Tabs>
				<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, flexWrap: 'wrap' }}>
					<TextField
						size="small"
						placeholder="Search recipes"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						sx={{ width: 220 }}
						slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
					/>
					{tab === 'Structures' &&
						['All', ...STRUCTURE_CATEGORIES].map((c) => (
							<Chip key={c} label={c} size="small" color={category === c ? 'primary' : 'default'} variant={category === c ? 'filled' : 'outlined'} onClick={() => setCategory(c)} />
						))}
				</Box>
				<Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: 1.5, pb: 1.5 }}>
					<Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: 1 }}>
						{shown.map((r) => (
							<Tile key={r.id} recipe={r} selected={r.id === selected} onPick={pick} />
						))}
					</Box>
					{!shown.length && (
						<Typography variant="body2" color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>
							No recipe matches.
						</Typography>
					)}
				</Box>
			</Paper>

			<Paper variant="outlined" sx={{ minHeight: 0, overflowY: 'auto' }}>
				{recipe ? (
					<Detail key={recipe.id} recipe={recipe} />
				) : (
					<Typography variant="body2" color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>
						Pick a recipe to see what it takes.
					</Typography>
				)}
			</Paper>

			<Paper variant="outlined" sx={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
				<Box sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1.25, borderBottom: 1, borderColor: 'divider' }}>
					<Typography variant="subtitle1" fontWeight={700} sx={{ flex: 1 }}>
						Checklist
					</Typography>
					{craft.list.length > 0 && (
						<Button size="small" color="error" onClick={() => updateCraft({ ...defaultCraft })}>
							Clear
						</Button>
					)}
				</Box>
				<Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
					<Checklist onPick={pick} />
				</Box>
			</Paper>
		</Box>
	)
}
