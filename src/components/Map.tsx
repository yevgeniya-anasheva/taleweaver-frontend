import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  pointerWithin,
} from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import type {
  MouseCoordinates,
  CharacterAbilities,
  InventoryItem,
  CharacterTrait,
  AttackAbility,
  WorldState,
  WorldTile,
  MoveDirection,
  MoveRejectReason,
  PlayerPosition,
} from '../session/types'

interface CoordinatesMapProps {
  clientCoordinates: globalThis.Map<string, MouseCoordinates>
  websocketRef: React.RefObject<WebSocket | null>
  clientId: string
  isRoomConnected: boolean
  characterPortrait: string | null
  hp: number | null
  maxHp: number | null
  ac: number | null
  actions: string[]
  abilities: CharacterAbilities | null
  stats: Record<string, number> | null
  inventory: InventoryItem[]
  quest: { title?: string; description?: string; progress?: string } | null
  characterCreated: boolean
  charDescription: string | null
  race: string | null
  traits: CharacterTrait[]
  worldState: WorldState | null
  moveRejection: MoveRejectReason | null
  onMove: (move: { direction: MoveDirection } | { target: PlayerPosition }) => void
  onClearMoveRejection: () => void
  onRequestCharacterCreation: () => void
  onAttackStateChange?: (isAttacking: boolean) => void
}

const TILE_BG: Record<string, string> = {
  grass: 'bg-emerald-700/60',
  forest: 'bg-emerald-900/70',
  water: 'bg-sky-700/70',
  mountain: 'bg-stone-500/70',
  building: 'bg-amber-700/70',
}

const WALKABLE_TYPES = new Set(['grass', 'forest'])

function isWalkable(tile: WorldTile | undefined): boolean {
  return !!tile && WALKABLE_TYPES.has(tile.type)
}

function moveRejectionLabel(reason: MoveRejectReason): string {
  switch (reason) {
    case 'leash':
      return "You can't stray that far from the party."
    case 'impassable':
      return "That tile isn't passable."
    case 'occupied':
      return 'Another adventurer is already standing there.'
    case 'out_of_bounds':
      return "You can't leave the world."
    case 'too_far':
      return 'Move only one tile at a time.'
    case 'invalid_direction':
      return 'Unknown direction.'
    default:
      return 'Move rejected.'
  }
}

//set of colours for players' pieces / pawns
const PIECE_COLORS = [
  'bg-blue-500',
  'bg-red-500',
  'bg-green-500',
  'bg-yellow-500',
  'bg-purple-500',
  'bg-pink-500',
  'bg-indigo-500',
  'bg-orange-500',
]

function pieceColorFor(pieceClientId: string): string {
  const idx = parseInt(pieceClientId.slice(-1) || '0', 16) % PIECE_COLORS.length
  return PIECE_COLORS[idx]
}

function PieceVisual({
  pieceClientId,
  isSelf,
  isSelected,
  ghost = false,
}: {
  pieceClientId: string
  isSelf: boolean
  isSelected: boolean
  ghost?: boolean
}) {
  const pieceColor = pieceColorFor(pieceClientId)
  const borderClass = isSelected
    ? 'border-yellow-400 border-4'
    : isSelf
      ? 'border-stone-100'
      : 'border-stone-300'
  return (
    <div
      className={`${ghost ? 'w-12 h-12' : 'w-[70%] h-[70%] absolute inset-0 m-auto'} ${pieceColor} rounded-full border-2 ${borderClass} shadow-lg flex items-center justify-center text-white text-sm font-bold pointer-events-none`}
    >
      {pieceClientId.slice(-1).toUpperCase()}
    </div>
  )
}

function DraggablePiece({
  pieceClientId,
  isSelf,
  isSelected,
  canDrag,
  isActiveDrag,
  onSelect,
}: {
  pieceClientId: string
  isSelf: boolean
  isSelected: boolean
  canDrag: boolean
  isActiveDrag: boolean
  onSelect: () => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `piece-${pieceClientId}`,
    data: { pieceClientId },
    disabled: !canDrag,
  })

  const cursorClass = canDrag
    ? isDragging || isActiveDrag
      ? 'cursor-grabbing opacity-30'
      : 'cursor-grab'
    : 'cursor-pointer'

  const pieceColor = pieceColorFor(pieceClientId)
  const borderClass = isSelected
    ? 'border-yellow-400 border-4'
    : isSelf
      ? 'border-stone-100'
      : 'border-stone-300'

  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      onClick={(event) => {
        event.stopPropagation()
        onSelect()
      }}
      className={`absolute inset-0 m-auto w-[70%] h-[70%] ${pieceColor} rounded-full border-2 ${borderClass} shadow-lg flex items-center justify-center text-white text-sm font-bold ${cursorClass} touch-none`}
      title={`Player: ${pieceClientId.slice(-6)}${isSelf ? ' (you)' : ''}${
        canDrag ? ` — drag up to ${MAX_MOVE_STEP} tiles to move` : ''
      }`}
    >
      {pieceClientId.slice(-1).toUpperCase()}
    </button>
  )
}

interface MapGameState {
  selectedPiece: string | null
  selectedAbility: { ability: AttackAbility; type: 'melee' | 'ranged' } | null
  rangeSquares: PlayerPosition[]
  diceRolls: { roll: number; targetAc: number; hit: boolean; damage?: number }[]
  traitsExpanded: boolean
}

const MAX_MOVE_STEP = 6
const TILE_DROPPABLE_PREFIX = 'tile-'
const tileDroppableId = (col: number, row: number) =>
  `${TILE_DROPPABLE_PREFIX}${col}-${row}`
const parseTileDroppableId = (id: string): PlayerPosition | null => {
  if (!id.startsWith(TILE_DROPPABLE_PREFIX)) return null
  const [colStr, rowStr] = id.slice(TILE_DROPPABLE_PREFIX.length).split('-')
  const col = parseInt(colStr, 10)
  const row = parseInt(rowStr, 10)
  if (Number.isNaN(col) || Number.isNaN(row)) return null
  return { x: col, y: row }
}

function DroppableTile({
  col,
  row,
  isDraggingPiece,
  canDropOnTile,
  isEdgeTarget,
  stepDistance,
  isInAttackRange,
  bg,
  doorSide,
  titleText,
  onClick,
  children,
}: {
  col: number
  row: number
  isDraggingPiece: boolean
  canDropOnTile: boolean
  isEdgeTarget: boolean
  stepDistance: number | null
  isInAttackRange: boolean
  bg: string
  doorSide: string | null | undefined
  titleText: string
  onClick: () => void
  children?: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: tileDroppableId(col, row),
    disabled: !canDropOnTile,
    data: { rel: { x: col, y: row } },
  })

  const isDragOver = isDraggingPiece && isOver && canDropOnTile

  return (
    <div
      ref={setNodeRef}
      onClick={onClick}
      className={`relative border border-stone-900/40 ${bg} ${
        isInAttackRange ? 'ring-2 ring-red-400/70' : ''
      } ${
        isDragOver
          ? 'outline outline-4 outline-yellow-300 bg-yellow-500/20'
          : isDraggingPiece && isEdgeTarget
            ? 'outline outline-2 outline-yellow-300/60'
            : ''
      }`}
      title={titleText}
    >
      {doorSide && (
        <div className="absolute inset-0 flex items-center justify-center text-stone-100 text-xs font-bold pointer-events-none">
          {doorSide === 'top' && (
            <span className="absolute top-0 left-0 right-0 text-center">▔</span>
          )}
          {doorSide === 'bottom' && (
            <span className="absolute bottom-0 left-0 right-0 text-center">▁</span>
          )}
          {doorSide === 'left' && (
            <span className="absolute left-0 top-0 bottom-0 flex items-center">▏</span>
          )}
          {doorSide === 'right' && (
            <span className="absolute right-0 top-0 bottom-0 flex items-center">▕</span>
          )}
        </div>
      )}
      {isDraggingPiece && isEdgeTarget && stepDistance !== null && (
        <span className="absolute top-0.5 right-1 text-[10px] font-semibold text-yellow-200/90 select-none pointer-events-none">
          {stepDistance}
        </span>
      )}
      {children}
    </div>
  )
}

export function Map({
  websocketRef,
  clientId,
  isRoomConnected,
  characterPortrait,
  hp,
  maxHp,
  ac,
  actions,
  abilities,
  stats,
  inventory,
  quest,
  characterCreated,
  charDescription,
  race,
  traits,
  worldState,
  moveRejection,
  onMove,
  onClearMoveRejection,
  onRequestCharacterCreation,
  onAttackStateChange,
}: CoordinatesMapProps) {
  const boardRef = useRef<HTMLDivElement>(null)

  const [mapGameState, setMapGameState] = useState<MapGameState>({
    selectedPiece: null,
    selectedAbility: null,
    rangeSquares: [],
    diceRolls: [],
    traitsExpanded: false,
  })

  const updateMapGameState = (updates: Partial<MapGameState>) => {
    setMapGameState((prev) => ({ ...prev, ...updates }))
  }

  const viewSize = worldState?.viewport.size ?? 10
  const tileGrid = useMemo<(WorldTile | undefined)[][]>(() => {
    const grid: (WorldTile | undefined)[][] = Array.from({ length: viewSize }, () =>
      Array.from({ length: viewSize }, () => undefined),
    )
    if (!worldState) return grid
    for (const tile of worldState.tiles) {
      if (
        tile.rel_y >= 0 &&
        tile.rel_y < viewSize &&
        tile.rel_x >= 0 &&
        tile.rel_x < viewSize
      ) {
        grid[tile.rel_y][tile.rel_x] = tile
      }
    }
    return grid
  }, [worldState, viewSize])

  const playersInView = useMemo(() => {
    if (!worldState) return [] as { id: string; rel: PlayerPosition; world: PlayerPosition }[]
    const { start_x, start_y, size } = worldState.viewport
    return Object.entries(worldState.playerPositions)
      .map(([id, pos]) => ({
        id,
        world: pos,
        rel: { x: pos.x - start_x, y: pos.y - start_y },
      }))
      .filter(
        ({ rel }) => rel.x >= 0 && rel.x < size && rel.y >= 0 && rel.y < size,
      )
  }, [worldState])

  const myWorldPos = worldState?.playerPositions[clientId] ?? null

  useEffect(() => {
    if (!moveRejection) return
    const timer = window.setTimeout(() => onClearMoveRejection(), 2000)
    return () => window.clearTimeout(timer)
  }, [moveRejection, onClearMoveRejection])

  const [activeDragPieceId, setActiveDragPieceId] = useState<string | null>(null)
  const isDraggingPiece = activeDragPieceId !== null

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  )

  // My viewport-relative position
  const myRel = useMemo(() => {
    if (!myWorldPos || !worldState) return null
    return {
      x: myWorldPos.x - worldState.viewport.start_x,
      y: myWorldPos.y - worldState.viewport.start_y,
    }
  }, [myWorldPos, worldState])


  // Returns a Map keyed by x,y
  const reachableTiles = useMemo(() => {
    const result = new globalThis.Map<string, number>()
    if (!myRel) return result
    const blocked = new Set(
      playersInView
        .filter((p) => p.id !== clientId)
        .map((p) => `${p.rel.x},${p.rel.y}`),
    )
    const startKey = `${myRel.x},${myRel.y}`
    const visited = new globalThis.Map<string, number>([[startKey, 0]])
    let frontier: PlayerPosition[] = [myRel]
    while (frontier.length) {
      const next: PlayerPosition[] = []
      for (const cur of frontier) {
        const d = visited.get(`${cur.x},${cur.y}`) ?? 0
        if (d >= MAX_MOVE_STEP) continue
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue
            const nx = cur.x + dx
            const ny = cur.y + dy
            if (nx < 0 || nx >= viewSize || ny < 0 || ny >= viewSize) continue
            const key = `${nx},${ny}`
            if (visited.has(key)) continue
            if (blocked.has(key)) continue
            const tile = tileGrid[ny]?.[nx]
            if (!isWalkable(tile)) continue
            visited.set(key, d + 1)
            next.push({ x: nx, y: ny })
          }
        }
      }
      frontier = next
    }
    visited.delete(startKey)
    for (const [key, dist] of visited.entries()) result.set(key, dist)
    return result
  }, [myRel, tileGrid, viewSize, playersInView, clientId])

  const isValidDropTarget = (rel: PlayerPosition) =>
    reachableTiles.has(`${rel.x},${rel.y}`)

  // outer border of reachable tiles
  const maxReachableDistance = useMemo(() => {
    let maxDistance = 0
    for (const dist of reachableTiles.values()) {
      if (dist > maxDistance) maxDistance = dist
    }
    return maxDistance
  }, [reachableTiles])

  const canDragMyPiece =
    isRoomConnected && !mapGameState.selectedAbility && !!myRel

  const activePieceClientId =
    activeDragPieceId && activeDragPieceId.startsWith('piece-')
      ? activeDragPieceId.slice('piece-'.length)
      : null

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragPieceId(String(event.active.id))
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragPieceId(null)
    if (!worldState) return
    const overId = event.over?.id
    if (typeof overId !== 'string') return
    const rel = parseTileDroppableId(overId)
    if (!rel) return
    if (!isValidDropTarget(rel)) return
    const target: PlayerPosition = {
      x: rel.x + worldState.viewport.start_x,
      y: rel.y + worldState.viewport.start_y,
    }
    onMove({ target })
  }

  const handleDragCancel = () => {
    setActiveDragPieceId(null)
  }

  const calculateRangeSquares = (
    center: PlayerPosition,
    range: number,
  ): PlayerPosition[] => {
    const squares: PlayerPosition[] = []
    const tilesOfReach = Math.max(1, Math.floor(range / 5))
    for (let row = 0; row < viewSize; row++) {
      for (let col = 0; col < viewSize; col++) {
        const distance = Math.abs(row - center.y) + Math.abs(col - center.x)
        if (distance > 0 && distance <= tilesOfReach) {
          squares.push({ x: col, y: row })
        }
      }
    }
    return squares
  }

  // Recalculate the range overlay if our position or selected ability changes
  useEffect(() => {
    if (!mapGameState.selectedAbility || !myRel) {
      if (mapGameState.rangeSquares.length > 0) {
        updateMapGameState({ rangeSquares: [] })
      }
      return
    }
    const squares = calculateRangeSquares(myRel, mapGameState.selectedAbility.ability.range)
    updateMapGameState({ rangeSquares: squares })
  }, [mapGameState.selectedAbility, myRel?.x, myRel?.y])

  // Tile click is only used for attack targeting
  const handleTileClick = (rel: PlayerPosition) => {
    if (!worldState) return
    if (!mapGameState.selectedAbility || mapGameState.selectedPiece !== clientId) return

    const target = playersInView.find(
      (p) => p.rel.x === rel.x && p.rel.y === rel.y && p.id !== clientId,
    )
    if (target) {
      handlePieceSelect(target.id)
    }
  }

  const handlePieceSelect = (pieceClientId: string) => {
    if (pieceClientId === clientId) {
      updateMapGameState({
        selectedPiece: pieceClientId,
        selectedAbility: null,
        rangeSquares: [],
        diceRolls: [],
      })
      if (onAttackStateChange) onAttackStateChange(false)
      return
    }

    if (mapGameState.selectedAbility && mapGameState.selectedPiece === clientId && worldState && myRel) {
      const target = worldState.playerPositions[pieceClientId]
      if (!target) return

      const targetRel = {
        x: target.x - worldState.viewport.start_x,
        y: target.y - worldState.viewport.start_y,
      }

      const currentRangeSquares = calculateRangeSquares(
        myRel,
        mapGameState.selectedAbility.ability.range,
      )
      const isInRange = currentRangeSquares.some(
        (sq) => sq.x === targetRel.x && sq.y === targetRel.y,
      )
      if (!isInRange) return

      const roll = Math.floor(Math.random() * 20) + 1
      const targetAc = ac || 10
      const hit = roll > targetAc
      let damage = 0
      if (hit) {
        damage = mapGameState.selectedAbility.ability.baseDamage
        const ws = websocketRef.current
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: 'attack',
              attacker: clientId,
              target: pieceClientId,
              damage,
              roll,
              targetAc,
            }),
          )
        }
      }

      updateMapGameState({
        diceRolls: [...mapGameState.diceRolls, { roll, targetAc, hit, damage }],
      })

      window.setTimeout(() => {
        updateMapGameState({
          selectedAbility: null,
          selectedPiece: null,
          rangeSquares: [],
          diceRolls: [],
        })
        if (onAttackStateChange) onAttackStateChange(false)
      }, 3000)
      return
    }

    updateMapGameState({ selectedPiece: pieceClientId })
  }

  const handleAbilitySelect = (ability: AttackAbility, type: 'melee' | 'ranged') => {
    if (
      mapGameState.selectedAbility?.ability.attackName === ability.attackName &&
      mapGameState.selectedAbility?.type === type
    ) {
      updateMapGameState({ selectedAbility: null, rangeSquares: [] })
      if (onAttackStateChange) onAttackStateChange(false)
      return
    }
    updateMapGameState({
      selectedPiece: clientId,
      selectedAbility: { ability, type },
    })
    if (onAttackStateChange) onAttackStateChange(true)
  }

  return (
    <div className="hidden sm:block lg:mt-[2%] mt-[5%] w-full">
      <div className="flex gap-4 items-start justify-center w-full max-w-full">
        {/* Left HUD Panel */}
        <div className="flex-shrink-0 w-64 bg-stone-900/90 border-2 border-stone-700 rounded-[16px] p-4 backdrop-blur-sm shadow-xl">
          {characterCreated && (
            <div className="mb-4">
              <div className="w-full aspect-square bg-stone-800/50 border-2 border-stone-700 rounded-lg overflow-hidden flex items-center justify-center p-2">
                {characterPortrait ? (
                  <pre className="w-full h-full text-sm leading-tight text-stone-200 font-mono whitespace-pre-wrap break-all overflow-auto text-center flex items-center justify-center">
                    {characterPortrait}
                  </pre>
                ) : (
                  <div className="text-stone-500 text-sm text-center px-4">
                    No portrait available
                  </div>
                )}
              </div>
              {charDescription && (
                <div className="mt-2 text-sm text-stone-300 leading-relaxed">
                  {charDescription}
                </div>
              )}
              {race && (
                <div className="mt-2 text-sm text-stone-200 font-semibold">
                  Race: <span className="text-stone-300 font-normal">{race}</span>
                </div>
              )}
            </div>
          )}

          {characterCreated && (
            <div className="mb-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-semibold text-stone-200">HP</span>
                <span className="text-sm text-stone-300">
                  {hp !== null && maxHp !== null ? `${hp} / ${maxHp}` : '—'}
                </span>
              </div>
              <div className="w-full h-4 bg-stone-800/50 rounded-full overflow-hidden border border-stone-700">
                <div
                  className="h-full bg-red-600 transition-all duration-300"
                  style={{
                    width:
                      hp !== null && maxHp !== null && maxHp > 0
                        ? `${(hp / maxHp) * 100}%`
                        : '0%',
                  }}
                />
              </div>
              {ac !== null && (
                <div className="mt-2 flex justify-between items-center">
                  <span className="text-sm font-semibold text-stone-200">AC</span>
                  <span className="text-sm text-stone-300">{ac}</span>
                </div>
              )}
            </div>
          )}

          {characterCreated && (
            <div
              className={`mb-4 ${
                mapGameState.selectedPiece === clientId ? 'ring-2 ring-yellow-400 rounded-lg p-2' : ''
              }`}
            >
              <h3 className="text-base font-semibold text-stone-200 mb-2">Available Actions</h3>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {abilities ? (() => {
                  const allAbilities: { ability: AttackAbility; type: 'melee' | 'ranged' }[] = []
                  if (abilities.melee) {
                    abilities.melee.forEach((ability) => allAbilities.push({ ability, type: 'melee' }))
                  }
                  if (abilities.ranged) {
                    abilities.ranged.forEach((ability) => allAbilities.push({ ability, type: 'ranged' }))
                  }
                  return allAbilities.length > 0 ? (
                    <>
                      {allAbilities.map((item, index) => {
                        const isSelected =
                          mapGameState.selectedAbility?.ability.attackName === item.ability.attackName &&
                          mapGameState.selectedAbility?.type === item.type
                        return (
                          <div key={index}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleAbilitySelect(item.ability, item.type)
                              }}
                              className={`w-full text-left text-sm px-2 py-1.5 border rounded text-stone-300 transition-colors cursor-pointer ${
                                isSelected
                                  ? 'bg-yellow-600/50 border-yellow-500'
                                  : 'bg-stone-800/50 border-stone-700 hover:bg-stone-700/50'
                              }`}
                            >
                              {item.ability.attackName} ({item.type}, {item.ability.baseDamage}dmg, {item.ability.range} range)
                            </button>
                            {isSelected && (
                              <div className="mt-1 px-2 text-sm font-semibold text-yellow-400 animate-pulse">
                                → Select target
                              </div>
                            )}
                            {isSelected && mapGameState.diceRolls.length > 0 && (
                              <div className="mt-1 px-2 space-y-1">
                                {mapGameState.diceRolls.map((roll, rollIndex) => (
                                  <div key={rollIndex} className="text-sm text-stone-400">
                                    Roll: {roll.roll} vs AC {roll.targetAc} - {roll.hit ? `Hit! ${roll.damage} damage` : 'Miss'}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </>
                  ) : (
                    <div className="text-sm text-stone-500 italic">No abilities available</div>
                  )
                })() : actions.length > 0 ? (
                  actions.map((action, index) => (
                    <div
                      key={index}
                      className="text-sm px-2 py-1 bg-stone-800/50 border border-stone-700 rounded text-stone-300"
                    >
                      {action}
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-stone-500 italic">No actions available</div>
                )}
              </div>
            </div>
          )}

          <div>
            {characterCreated ? (
              <>
                <h3 className="text-base font-semibold text-stone-200 mb-2">Stats</h3>
                <div className="space-y-1">
                  {stats ? (
                    <>
                      {(['str', 'dex', 'con', 'int', 'wis', 'chr'] as const).map((key) =>
                        stats[key] !== undefined ? (
                          <div key={key} className="flex justify-between text-sm text-stone-300">
                            <span>{key.toUpperCase()}:</span>
                            <span className="font-semibold">{stats[key]}</span>
                          </div>
                        ) : null,
                      )}
                      {Object.entries(stats).map(([key, value]) => {
                        if (!['str', 'dex', 'con', 'int', 'wis', 'chr'].includes(key.toLowerCase())) {
                          return (
                            <div key={key} className="flex justify-between text-sm text-stone-300">
                              <span className="uppercase">{key}:</span>
                              <span className="font-semibold">{value}</span>
                            </div>
                          )
                        }
                        return null
                      })}
                    </>
                  ) : (
                    <div className="text-sm text-stone-500 italic">No stats available</div>
                  )}
                </div>

                {traits.length > 0 && (
                  <div className="mt-4">
                    <button
                      onClick={() => updateMapGameState({ traitsExpanded: !mapGameState.traitsExpanded })}
                      className="w-full text-left text-sm font-semibold text-stone-200 mb-2 flex items-center justify-between"
                    >
                      <span>Traits</span>
                      <span className="text-xs">{mapGameState.traitsExpanded ? '▼' : '▶'}</span>
                    </button>
                    {mapGameState.traitsExpanded && (
                      <div className="space-y-2">
                        {traits.map((trait, index) => (
                          <div key={index} className="text-sm text-stone-300">
                            <div className="font-semibold text-stone-200">{trait.traitName}</div>
                            <div className="text-stone-400 mt-1">{trait.traitDescription}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <button
                onClick={onRequestCharacterCreation}
                className="w-full py-3 px-4 bg-stone-700 hover:bg-stone-600 text-stone-50 font-semibold rounded-lg transition-colors shadow-lg mt-4"
              >
                Create randomized character
              </button>
            )}
          </div>
        </div>

        {/* Map */}
        <div className="flex-1 w-full max-w-full overflow-hidden">
          <div className="max-w-2xl mx-auto">

            {moveRejection && (
              <div className="mb-2 text-xs text-amber-300 bg-amber-900/30 border border-amber-700/60 rounded px-2 py-1">
                {moveRejectionLabel(moveRejection)}
              </div>
            )}

            <DndContext
              sensors={sensors}
              collisionDetection={pointerWithin}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
            >
              <div
                ref={boardRef}
                data-map-board
                className="relative w-full aspect-square border-stone-700 border-2 rounded-[24px] overflow-hidden"
                style={{
                  background:
                    'linear-gradient(94.15deg, rgba(68, 64, 60, 0.4) 0%, rgba(41, 37, 36, 0.5) 100%)',
                }}
              >
                <div
                  className="grid h-full w-full"
                  style={{
                    gridTemplateColumns: `repeat(${viewSize}, minmax(0, 1fr))`,
                    gridTemplateRows: `repeat(${viewSize}, minmax(0, 1fr))`,
                    gap: 0,
                  }}
                >
                  {Array.from({ length: viewSize * viewSize }, (_, index) => {
                    const row = Math.floor(index / viewSize)
                    const col = index % viewSize
                    const tile = tileGrid[row]?.[col]
                    const tileType = tile?.type ?? 'forest'
                    const bg = TILE_BG[tileType] ?? 'bg-stone-700/60'

                    const piece = playersInView.find(
                      (p) => p.rel.x === col && p.rel.y === row,
                    )

                    const cellRel: PlayerPosition = { x: col, y: row }
                    const canDropOnTile =
                      isDraggingPiece && isValidDropTarget(cellRel)
                    const stepDistance =
                      reachableTiles.get(`${col},${row}`) ?? null
                    const isEdgeTarget =
                      canDropOnTile &&
                      stepDistance !== null &&
                      stepDistance === maxReachableDistance

                    const isInAttackRange = mapGameState.rangeSquares.some(
                      (sq) => sq.x === col && sq.y === row,
                    )

                    return (
                      <DroppableTile
                        key={`${row}-${col}`}
                        col={col}
                        row={row}
                        isDraggingPiece={isDraggingPiece}
                        canDropOnTile={canDropOnTile}
                        isEdgeTarget={isEdgeTarget}
                        stepDistance={stepDistance}
                        isInAttackRange={isInAttackRange}
                        bg={bg}
                        doorSide={tile?.door}
                        titleText={
                          tile
                            ? `(${tile.world_x}, ${tile.world_y}) — ${tile.type}`
                            : `(${col}, ${row})`
                        }
                        onClick={() => handleTileClick(cellRel)}
                      >
                        {piece && (
                          <DraggablePiece
                            pieceClientId={piece.id}
                            isSelf={piece.id === clientId}
                            isSelected={mapGameState.selectedPiece === piece.id}
                            canDrag={piece.id === clientId && canDragMyPiece}
                            isActiveDrag={
                              activePieceClientId !== null &&
                              piece.id === activePieceClientId
                            }
                            onSelect={() => handlePieceSelect(piece.id)}
                          />
                        )}
                      </DroppableTile>
                    )
                  })}
                </div>
              </div>
              <DragOverlay dropAnimation={null}>
                {activePieceClientId ? (
                  <PieceVisual
                    pieceClientId={activePieceClientId}
                    isSelf={activePieceClientId === clientId}
                    isSelected={false}
                    ghost
                  />
                ) : null}
              </DragOverlay>
            </DndContext>
          </div>
        </div>

        {/* Right HUD Panel */}
        <div className="flex-shrink-0 w-64 bg-stone-900/90 border-2 border-stone-700 rounded-[16px] p-4 backdrop-blur-sm shadow-xl">
          <div className="mb-4">
            <h3 className="text-base font-semibold text-stone-200 mb-2">Inventory</h3>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {inventory.length > 0 ? (
                inventory.map((item, index) => (
                  <div
                    key={index}
                    className="text-sm px-2 py-1 bg-stone-800/50 border border-stone-700 rounded"
                  >
                    <div className="font-semibold text-stone-200">{item.itemName}</div>
                    {item.itemDescription && (
                      <div className="text-stone-400 mt-1">{item.itemDescription}</div>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-sm text-stone-500 italic">Inventory is empty</div>
              )}
            </div>
          </div>

          <div>
            <h3 className="text-base font-semibold text-stone-200 mb-2">Current Quest</h3>
            {quest ? (
              <div className="space-y-2">
                {quest.title && (
                  <div className="text-sm font-semibold text-stone-100">{quest.title}</div>
                )}
                {quest.description && (
                  <div className="text-sm text-stone-300 leading-relaxed">{quest.description}</div>
                )}
                {quest.progress && (
                  <div className="text-sm text-stone-400 italic border-t border-stone-700 pt-2 mt-2">
                    Progress: {quest.progress}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-stone-500 italic">No active quest</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
