import { memo, useMemo, useState } from 'react'
import {
	Avatar,
	Box,
	Chip,
	IconButton,
	InputAdornment,
	List,
	ListItemButton,
	MenuItem,
	Paper,
	TextField,
	Tooltip,
	Typography
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import PlaceIcon from '@mui/icons-material/PlaceOutlined'
import StarIcon from '@mui/icons-material/Star'
import StarBorderIcon from '@mui/icons-material/StarBorder'
import { getPal } from '../data/gamedata'
import {
	isPalOffer,
	ITEM_CATEGORIES,
	ROLE_INFO,
	townById,
	towns,
	type ItemOffer,
	type Merchant,
	type MerchantRole,
	type Offer,
	type PalOffer,
	type Town
} from '../data/merchants'
import { useStore } from '../state/store'
import { rarityColor } from '../theme'
import { PalAvatar } from './bits'

const asset = (file: string) => `${import.meta.env.BASE_URL}${file}`
const CURRENCY_ICON = { gold: 'items/T_itemicon_Material_Money.webp', bounty: 'items/T_icon_item_Jewelry_BountyProof_1.webp' }
const CURRENCY_NAME = { gold: 'Gold Coin', bounty: 'Successful Bounty Token' }

type SortKey = 'shop' | 'name' | 'priceAsc' | 'priceDesc'

/** Stock rows have a fixed height so a card can cap at exactly this many before it scrolls */
const ROW_HEIGHT = 50
const VISIBLE_ROWS = 10

const offerName = (o: Offer) => (isPalOffer(o) ? getPal(o.palId).name : o.name)
const offerKey = (o: Offer) => (isPalOffer(o) ? `pal:${o.palId}` : `item:${o.itemId}`)
/** What you actually pay, for sorting: the low end of a pal's level-scaled price */
const offerPrice = (o: Offer) => (isPalOffer(o) ? o.priceAtLevel?.[0] ?? o.price : o.price)

function Price({ value, currency, approx }: { value: string; currency: 'gold' | 'bounty'; approx?: boolean }) {
	return (
		<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, whiteSpace: 'nowrap' }} title={CURRENCY_NAME[currency]}>
			<img src={asset(CURRENCY_ICON[currency])} alt="" width={18} height={18} />
			<Typography variant="body2" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums', color: currency === 'gold' ? '#f0d47a' : '#c8b08a' }}>
				{approx ? '~' : ''}
				{value}
			</Typography>
		</Box>
	)
}

function ItemIcon({ icon, size = 36 }: { icon: string; size?: number }) {
	return (
		<Box
			sx={{
				width: size,
				height: size,
				flexShrink: 0,
				borderRadius: 1.5,
				bgcolor: 'rgba(255,255,255,0.05)',
				border: 1,
				borderColor: 'rgba(255,255,255,0.08)',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center'
			}}
		>
			<img src={asset(`items/${icon}.webp`)} alt="" width={size - 6} height={size - 6} loading="lazy" />
		</Box>
	)
}

function Portrait({ merchant, size = 44 }: { merchant: Merchant; size?: number }) {
	const color = ROLE_INFO[merchant.role].color
	return (
		<Avatar
			src={asset(`npc/${merchant.portrait}.webp`)}
			alt={merchant.npc}
			sx={{ width: size, height: size, bgcolor: `${color}22`, border: `2px solid ${color}` }}
		/>
	)
}

function WantedStar({ palId }: { palId: string }) {
	const { wanted, addWantedMany, removeWantedPal } = useStore()
	const isWanted = wanted.some((w) => w.palId === palId)
	return (
		<IconButton
			size="small"
			title={isWanted ? 'Remove from Target Pals' : 'Add to Target Pals'}
			onClick={() => (isWanted ? removeWantedPal(palId) : addWantedMany([palId]))}
		>
			{isWanted ? <StarIcon fontSize="small" sx={{ color: rarityColor(20) }} /> : <StarBorderIcon fontSize="small" />}
		</IconButton>
	)
}

const OfferRow = memo(function OfferRow({ offer, currency }: { offer: Offer; currency: 'gold' | 'bounty' }) {
	if (isPalOffer(offer)) return <PalRow offer={offer} />
	const item = offer as ItemOffer
	return (
		<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 1.5, height: ROW_HEIGHT, '&:hover': { bgcolor: 'action.hover' } }}>
			<ItemIcon icon={item.icon} />
			<Box sx={{ flex: 1, minWidth: 0 }}>
				<Typography variant="body2" fontWeight={600} noWrap>
					{item.name}
					{item.quantity > 1 && (
						<Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 0.75 }}>
							x{item.quantity.toLocaleString()}
						</Typography>
					)}
				</Typography>
				<Typography variant="caption" color="text.secondary">
					{item.category}
				</Typography>
			</Box>
			<Price value={item.price.toLocaleString()} currency={currency} />
		</Box>
	)
})

function PalRow({ offer }: { offer: PalOffer }) {
	const pal = getPal(offer.palId)
	const [lo, hi] = offer.priceAtLevel ?? [offer.price, offer.price]
	return (
		<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 1.5, height: ROW_HEIGHT, '&:hover': { bgcolor: 'action.hover' } }}>
			<PalAvatar palId={offer.palId} size={36} />
			<Box sx={{ flex: 1, minWidth: 0 }}>
				<Typography variant="body2" fontWeight={600} noWrap>
					{pal.name}
				</Typography>
				<Typography variant="caption" color="text.secondary">
					Lv {offer.level[0]}-{offer.level[1]}
				</Typography>
			</Box>
			<Tooltip title={offer.priceAtLevel ? `Estimated for its level range; base price ${offer.price.toLocaleString()}` : 'Base price; the actual price rises with level'}>
				<span>
					<Price value={offer.priceAtLevel ? `${lo.toLocaleString()}-${hi.toLocaleString()}` : offer.price.toLocaleString()} currency="gold" approx />
				</span>
			</Tooltip>
			<WantedStar palId={offer.palId} />
		</Box>
	)
}

function sortOffers(stock: Offer[], sort: SortKey): Offer[] {
	if (sort === 'shop') return stock
	const list = [...stock]
	if (sort === 'name') return list.sort((a, b) => offerName(a).localeCompare(offerName(b)))
	return list.sort((a, b) => (sort === 'priceAsc' ? offerPrice(a) - offerPrice(b) : offerPrice(b) - offerPrice(a)))
}

function MerchantCard({ merchant, stock }: { merchant: Merchant; stock: Offer[] }) {
	const info = ROLE_INFO[merchant.role]
	return (
		<Paper variant="outlined" sx={{ overflow: 'hidden', borderTop: `3px solid ${info.color}`, alignSelf: 'start' }}>
			<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
				<Portrait merchant={merchant} />
				<Box sx={{ flex: 1, minWidth: 0 }}>
					<Typography variant="subtitle1" fontWeight={700} lineHeight={1.2}>
						{info.title}
					</Typography>
					<Typography variant="caption" color="text.secondary">
						{merchant.npc}, {info.look}
					</Typography>
				</Box>
				<Chip size="small" variant="outlined" label={`${stock.length} ${merchant.role === 'pals' || merchant.role === 'black' ? 'Pals' : 'Items'}`} />
			</Box>
			{info.note && (
				<Typography variant="caption" color="text.secondary" component="div" sx={{ px: 1.5, pt: 1 }}>
					{info.note}
				</Typography>
			)}
			<Box sx={{ py: 0.5, maxHeight: ROW_HEIGHT * VISIBLE_ROWS + 8, overflowY: 'auto' }}>
				{stock.map((o) => (
					<OfferRow key={offerKey(o)} offer={o} currency={merchant.currency} />
				))}
			</Box>
		</Paper>
	)
}

function TownHeader({ town }: { town: Town }) {
	return (
		<Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, mb: 1.25 }}>
			<Typography variant="h6">{town.name}</Typography>
			<Typography variant="body2" color="text.secondary">
				{town.area}
			</Typography>
			{town.coords && (
				<Tooltip title="Map coordinates">
					<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, color: 'text.secondary' }}>
						<PlaceIcon sx={{ fontSize: 16 }} />
						<Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums' }}>
							{town.coords[0]}, {town.coords[1]}
						</Typography>
					</Box>
				</Tooltip>
			)}
		</Box>
	)
}

/** Shows every merchant in a town whose stock passes the filters */
function TownSection({
	town,
	filter,
	filtered,
	sort,
	onOpen
}: {
	town: Town
	filter: (m: Merchant, o: Offer) => boolean
	filtered: boolean
	sort: SortKey
	onOpen: (id: string) => void
}) {
	if (town.sameStockAs) {
		// The camp's stock already shows under the town it copies
		if (filtered) return null
		const source = townById.get(town.sameStockAs)!
		return (
			<Box sx={{ mb: 3 }}>
				<TownHeader town={town} />
				<Paper variant="outlined" sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
					<Box sx={{ display: 'flex', gap: 0.75 }}>
						{town.merchants.map((m) => (
							<Portrait key={m.id} merchant={m} size={32} />
						))}
					</Box>
					<Typography variant="body2" color="text.secondary">
						Same merchants and stock as{' '}
						<Box component="span" onClick={() => onOpen(source.id)} sx={{ color: 'primary.main', cursor: 'pointer', fontWeight: 600 }}>
							{source.name}
						</Box>
						, without the bounty officer.
					</Typography>
				</Paper>
			</Box>
		)
	}
	const cards = town.merchants
		.map((m) => ({ merchant: m, stock: sortOffers(m.stock.filter((o) => filter(m, o)), sort) }))
		.filter((c) => c.stock.length)
	if (!cards.length) return null
	return (
		<Box sx={{ mb: 3 }}>
			<TownHeader town={town} />
			<Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 1.5 }}>
				{cards.map((c) => (
					<MerchantCard key={c.merchant.id} merchant={c.merchant} stock={c.stock} />
				))}
			</Box>
		</Box>
	)
}

/** Search results: each matching item with every place that sells it */
function WhereToBuy({ matches }: { matches: { offer: Offer; places: { town: Town; merchant: Merchant; offer: Offer }[] }[] }) {
	if (!matches.length) {
		return (
			<Typography variant="body2" color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>
				No merchant sells that.
			</Typography>
		)
	}
	return (
		<Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 1.5, alignItems: 'start' }}>
			{matches.map(({ offer, places }) => {
				const cheapest = Math.min(...places.map((p) => offerPrice(p.offer)))
				const varies = places.some((p) => offerPrice(p.offer) !== cheapest)
				return (
					<Paper key={offerKey(offer)} variant="outlined" sx={{ overflow: 'hidden' }}>
						<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, p: 1.25, borderBottom: 1, borderColor: 'divider' }}>
							{isPalOffer(offer) ? <PalAvatar palId={offer.palId} size={40} /> : <ItemIcon icon={(offer as ItemOffer).icon} size={40} />}
							<Box sx={{ flex: 1, minWidth: 0 }}>
								<Typography variant="subtitle2" noWrap>
									{offerName(offer)}
								</Typography>
								<Typography variant="caption" color="text.secondary">
									{isPalOffer(offer) ? 'Pal' : (offer as ItemOffer).category}, sold at {places.length} place{places.length > 1 ? 's' : ''}
								</Typography>
							</Box>
							{isPalOffer(offer) && <WantedStar palId={offer.palId} />}
						</Box>
						{places.map(({ town, merchant, offer: o }) => (
							<Box key={merchant.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 1.25, py: 0.75 }}>
								<Portrait merchant={merchant} size={28} />
								<Box sx={{ flex: 1, minWidth: 0 }}>
									<Typography variant="body2" fontWeight={600} noWrap>
										{town.name}
									</Typography>
									<Typography variant="caption" color="text.secondary">
										{ROLE_INFO[merchant.role].title}
										{isPalOffer(o) ? `, Lv ${o.level[0]}-${o.level[1]}` : ''}
									</Typography>
								</Box>
								{varies && offerPrice(o) === cheapest && <Chip size="small" color="success" variant="outlined" label="Cheapest" />}
								<Price
									value={
										isPalOffer(o) && o.priceAtLevel
											? `${o.priceAtLevel[0].toLocaleString()}-${o.priceAtLevel[1].toLocaleString()}`
											: o.price.toLocaleString()
									}
									currency={merchant.currency}
									approx={isPalOffer(o)}
								/>
							</Box>
						))}
					</Paper>
				)
			})}
		</Box>
	)
}

export function MerchantsPage() {
	const [search, setSearch] = useState('')
	const [category, setCategory] = useState('all')
	const [role, setRole] = useState<MerchantRole | 'all'>('all')
	const [sort, setSort] = useState<SortKey>('shop')
	const [townId, setTownId] = useState('all')

	const filter = useMemo(
		() => (m: Merchant, o: Offer) =>
			(role === 'all' || m.role === role) &&
			(category === 'all' || (category === 'pals' ? isPalOffer(o) : !isPalOffer(o) && (o as ItemOffer).category === category)),
		[role, category]
	)

	const matches = useMemo(() => {
		const q = search.trim().toLowerCase()
		if (!q) return null
		const byKey = new Map<string, { offer: Offer; places: { town: Town; merchant: Merchant; offer: Offer }[] }>()
		for (const town of towns) {
			if (townId !== 'all' && town.id !== townId) continue
			for (const merchant of town.merchants) {
				for (const offer of merchant.stock) {
					if (!offerName(offer).toLowerCase().includes(q) || !filter(merchant, offer)) continue
					const key = offerKey(offer)
					if (!byKey.has(key)) byKey.set(key, { offer, places: [] })
					byKey.get(key)!.places.push({ town, merchant, offer })
				}
			}
		}
		return [...byKey.values()].sort((a, b) => offerName(a.offer).localeCompare(offerName(b.offer)))
	}, [search, townId, filter])

	const shownTowns = townId === 'all' ? towns : towns.filter((t) => t.id === townId)

	return (
		<Paper variant="outlined" sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
			<Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5, p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
				<TextField
					size="small"
					placeholder="Search items and pals"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					sx={{ width: 260 }}
					slotProps={{
						input: {
							startAdornment: (
								<InputAdornment position="start">
									<SearchIcon fontSize="small" />
								</InputAdornment>
							)
						}
					}}
				/>
				<TextField select size="small" label="Category" value={category} onChange={(e) => setCategory(e.target.value)} sx={{ width: 170 }}>
					<MenuItem value="all">All</MenuItem>
					<MenuItem value="pals">Pals</MenuItem>
					{ITEM_CATEGORIES.map((c) => (
						<MenuItem key={c} value={c}>
							{c}
						</MenuItem>
					))}
				</TextField>
				<TextField select size="small" label="Merchant" value={role} onChange={(e) => setRole(e.target.value as MerchantRole | 'all')} sx={{ width: 180 }}>
					<MenuItem value="all">All</MenuItem>
					{(Object.keys(ROLE_INFO) as MerchantRole[]).map((r) => (
						<MenuItem key={r} value={r}>
							<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
								<Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: ROLE_INFO[r].color }} />
								{ROLE_INFO[r].title}
							</Box>
						</MenuItem>
					))}
				</TextField>
				<TextField select size="small" label="Sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} sx={{ width: 170 }}>
					<MenuItem value="shop">Shop Order</MenuItem>
					<MenuItem value="name">Name</MenuItem>
					<MenuItem value="priceAsc">Price, Low to High</MenuItem>
					<MenuItem value="priceDesc">Price, High to Low</MenuItem>
				</TextField>
			</Box>
			<Box sx={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '240px 1fr' }}>
				<List dense sx={{ borderRight: 1, borderColor: 'divider', overflowY: 'auto', py: 1 }}>
					<ListItemButton selected={townId === 'all'} onClick={() => setTownId('all')} sx={{ mx: 1, borderRadius: 1.5 }}>
						<Typography variant="body2" fontWeight={600}>
							All Merchants
						</Typography>
					</ListItemButton>
					{towns.map((t) => (
						<ListItemButton key={t.id} selected={townId === t.id} onClick={() => setTownId(t.id)} sx={{ mx: 1, borderRadius: 1.5, display: 'block' }}>
							<Typography variant="body2" fontWeight={600}>
								{t.name}
							</Typography>
							<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
								{t.merchants.map((m) => (
									<Box
										key={m.id}
										title={ROLE_INFO[m.role].title}
										sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: ROLE_INFO[m.role].color }}
									/>
								))}
								<Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
									{t.area}
								</Typography>
							</Box>
						</ListItemButton>
					))}
				</List>
				<Box sx={{ overflowY: 'auto', p: 2 }}>
					{matches ? (
						<WhereToBuy matches={matches} />
					) : (
						shownTowns.map((t) => (
							<TownSection key={t.id} town={t} filter={filter} filtered={role !== 'all' || category !== 'all'} sort={sort} onOpen={setTownId} />
						))
					)}
				</Box>
			</Box>
		</Paper>
	)
}
