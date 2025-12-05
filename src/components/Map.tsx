import { useRef, useState, useEffect } from 'react'
import { DndContext, useDraggable, useDroppable } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import type { MouseCoordinates, CharacterAbilities, InventoryItem, CharacterTrait, AttackAbility } from '../session/types'

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
  onRequestCharacterCreation: () => void
  onAttackStateChange?: (isAttacking: boolean) => void
}

interface BoardPosition {
  row: number
  col: number
}

// Convert screen coordinates to board position (0-9)
function coordinatesToBoardPosition(
  x: number,
  y: number,
  boardRect: DOMRect,
  boardSize: number
): BoardPosition | null {
  const relativeX = x - boardRect.left
  const relativeY = y - boardRect.top

  // Check if coordinates are within board bounds
  if (relativeX < 0 || relativeX > boardRect.width || relativeY < 0 || relativeY > boardRect.height) {
    return null
  }

  const col = Math.floor((relativeX / boardRect.width) * boardSize)
  const row = Math.floor((relativeY / boardRect.height) * boardSize)

  // Clamp to valid range
  return {
    row: Math.max(0, Math.min(boardSize - 1, row)),
    col: Math.max(0, Math.min(boardSize - 1, col)),
  }
}

// Convert board position to screen coordinates (center of square)
function boardPositionToCoordinates(
  position: BoardPosition,
  boardRect: DOMRect,
  boardSize: number
): { x: number; y: number } {
  const squareWidth = boardRect.width / boardSize
  const squareHeight = boardRect.height / boardSize

  return {
    x: boardRect.left + position.col * squareWidth + squareWidth / 2,
    y: boardRect.top + position.row * squareHeight + squareHeight / 2,
  }
}

function ChessSquare({ 
  row, 
  col, 
  children, 
  isInRange,
  onClick
}: { 
  row: number
  col: number
  children?: React.ReactNode
  isInRange?: boolean
  onClick?: () => void
}) {
  const { setNodeRef } = useDroppable({
    id: `square-${row}-${col}`,
  })

  const isLight = (row + col) % 2 === 0

  return (
    <div
      ref={setNodeRef}
      onClick={onClick}
      className={`relative border border-stone-600/30 ${
        isInRange 
          ? 'bg-red-500/30 border-red-400/50 border-2' 
          : isLight 
            ? 'bg-stone-800/40' 
            : 'bg-stone-900/60'
      }`}
      style={{ minWidth: 0, minHeight: 0 }}
    >
      {children}
    </div>
  )
}

function ChessPiece({ 
  clientId, 
  position, 
  isSelected, 
  onSelect,
  isDraggingDisabled
}: { 
  clientId: string
  position: BoardPosition
  isSelected: boolean
  onSelect: () => void
  isDraggingDisabled?: boolean
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: `piece-${clientId}`,
    data: { clientId, position },
    disabled: isDraggingDisabled,
  })

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined

  // Generate a color based on clientId
  const colors = [
    'bg-blue-500',
    'bg-red-500',
    'bg-green-500',
    'bg-yellow-500',
    'bg-purple-500',
    'bg-pink-500',
    'bg-indigo-500',
    'bg-orange-500',
  ]
  const colorIndex = parseInt(clientId.slice(-1) || '0', 16) % colors.length
  const pieceColor = colors[colorIndex]

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: style?.transform
          ? `${style.transform} translate(-50%, -50%)`
          : 'translate(-50%, -50%)',
        zIndex: 10,
      }}
      {...(isDraggingDisabled ? {} : listeners)}
      {...attributes}
      onClick={(e) => {
        e.stopPropagation()
        onSelect()
      }}
      className={`w-10 h-10 ${pieceColor} rounded-full border-2 ${
        isSelected ? 'border-yellow-400 border-4' : 'border-stone-300'
      } ${isDraggingDisabled ? 'cursor-default' : 'cursor-pointer'} shadow-lg flex items-center justify-center text-white text-sm font-bold`}
      title={`Player: ${clientId.slice(-6)}`}
    >
      {clientId.slice(-1).toUpperCase()}
    </div>
  )
}

export function Map({ 
  clientCoordinates, 
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
  onRequestCharacterCreation,
  onAttackStateChange,
}: CoordinatesMapProps) {
  const boardRef = useRef<HTMLDivElement>(null)
  const BOARD_SIZE = 10
  const [boardPositions, setBoardPositions] = useState<globalThis.Map<string, BoardPosition>>(new globalThis.Map())
  const lastDragTimeRef = useRef<number>(0)
  const lastDragPositionRef = useRef<BoardPosition | null>(null)
  
  // Game state
  const [selectedPiece, setSelectedPiece] = useState<string | null>(null)
  const [selectedAbility, setSelectedAbility] = useState<{ ability: AttackAbility; type: 'melee' | 'ranged' } | null>(null)
  const [rangeSquares, setRangeSquares] = useState<BoardPosition[]>([])
  const [diceRolls, setDiceRolls] = useState<{ roll: number; targetAc: number; hit: boolean; damage?: number }[]>([])
  const [traitsExpanded, setTraitsExpanded] = useState<boolean>(false)

  // Update board positions from coordinates
  useEffect(() => {
    if (!boardRef.current) return

    // Skip update if we just dragged (within last 500ms) to prevent jumping
    const timeSinceDrag = Date.now() - lastDragTimeRef.current
    if (timeSinceDrag < 500 && lastDragPositionRef.current) {
      return
    }

    // Don't update current player's position if an attack is selected
    if (selectedAbility && selectedPiece === clientId) {
      return
    }

    const boardRect = boardRef.current.getBoundingClientRect()
    const newPositions = new globalThis.Map<string, BoardPosition>()

    clientCoordinates.forEach((coords, cid) => {
      // For the current user, use the last drag position if recent
      if (cid === clientId && timeSinceDrag < 1000 && lastDragPositionRef.current) {
        newPositions.set(cid, lastDragPositionRef.current)
      } else {
        const position = coordinatesToBoardPosition(coords.x, coords.y, boardRect, BOARD_SIZE)
        if (position) {
          newPositions.set(cid, position)
        }
      }
    })

    setBoardPositions(newPositions)
  }, [clientCoordinates, clientId, selectedAbility, selectedPiece])

  // Check if a position is occupied
  const isPositionOccupied = (position: BoardPosition, excludeClientId?: string): boolean => {
    for (const [cid, pos] of boardPositions.entries()) {
      if (excludeClientId && cid === excludeClientId) continue
      if (pos.row === position.row && pos.col === position.col) {
        return true
      }
    }
    return false
  }

  // Calculate range squares around a position (Manhattan distance)
  const calculateRangeSquares = (center: BoardPosition, range: number): BoardPosition[] => {
    const squares: BoardPosition[] = []
    const rangeSquares = Math.max(1, Math.floor(range / 5))
    
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const distance = Math.abs(row - center.row) + Math.abs(col - center.col)
        if (distance <= rangeSquares && distance > 0) {
          squares.push({ row, col })
        }
      }
    }
    return squares
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (!over || !boardRef.current || !isRoomConnected) return

    const boardRect = boardRef.current.getBoundingClientRect()
    const activeData = active.data.current as { clientId: string; position: BoardPosition } | undefined

    if (!activeData || activeData.clientId !== clientId) return

    // PREVENT ALL MOVEMENT if an attack is selected
    if (selectedAbility && selectedPiece === clientId) {
      // Get the drop position to check for targets
      const squareId = over.id as string
      const match = squareId.match(/square-(\d+)-(\d+)/)
      if (!match) return

      const row = parseInt(match[1], 10)
      const col = parseInt(match[2], 10)

      // Clamp to valid range
      const dropPosition: BoardPosition = {
        row: Math.max(0, Math.min(BOARD_SIZE - 1, row)),
        col: Math.max(0, Math.min(BOARD_SIZE - 1, col)),
      }

      // Find if there's a target at the drop position
      let targetClientId: string | null = null
      boardPositions.forEach((pos, cid) => {
        if (pos.row === dropPosition.row && pos.col === dropPosition.col && cid !== clientId) {
          targetClientId = cid
        }
      })

      if (targetClientId) {
        // Trigger attack on the target
        handlePieceSelect(targetClientId)
      }
      // Always return early when attack is selected - no movement allowed
      return
    }

    // Normal movement logic (only if no attack is selected)
    // Get the drop position from the over target
    const squareId = over.id as string
    const match = squareId.match(/square-(\d+)-(\d+)/)
    if (!match) return

    const row = parseInt(match[1], 10)
    const col = parseInt(match[2], 10)

    // Clamp to valid range
    const dropPosition: BoardPosition = {
      row: Math.max(0, Math.min(BOARD_SIZE - 1, row)),
      col: Math.max(0, Math.min(BOARD_SIZE - 1, col)),
    }

    // Normal movement logic (only if no attack is selected)
    // Check if position is already occupied
    if (isPositionOccupied(dropPosition, clientId)) {
      return // Don't allow move to occupied square
    }

    // Convert board position to screen coordinates
    const screenCoords = boardPositionToCoordinates(dropPosition, boardRect, BOARD_SIZE)

    // Send new position via WebSocket
    const ws = websocketRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          clientId: clientId,
          x: screenCoords.x,
          y: screenCoords.y,
          timestamp: Date.now(),
        })
      )
    }

    // Update local position immediately and track drag
    lastDragTimeRef.current = Date.now()
    lastDragPositionRef.current = dropPosition
    setBoardPositions((prev) => {
      const newMap = new globalThis.Map(prev)
      newMap.set(clientId, dropPosition)
      return newMap
    })
  }

  const handlePieceSelect = (pieceClientId: string) => {
    if (pieceClientId === clientId) {
      // Select own piece
      setSelectedPiece(pieceClientId)
      setSelectedAbility(null)
      setRangeSquares([])
      setDiceRolls([])
      if (onAttackStateChange) onAttackStateChange(false)
    } else {
      // If another piece is selected and we have an ability selected, try to attack
      if (selectedAbility && selectedPiece === clientId) {
        const targetPosition = boardPositions.get(pieceClientId)
        const attackerPosition = boardPositions.get(clientId)
        if (targetPosition && attackerPosition) {
          // Check if target is in range
          const currentRangeSquares = calculateRangeSquares(attackerPosition, selectedAbility.ability.range)
          const isInRange = currentRangeSquares.some(
            sq => sq.row === targetPosition.row && sq.col === targetPosition.col
          )
          
          if (isInRange) {
            // Roll d20
            const roll = Math.floor(Math.random() * 20) + 1
            // Get target AC - for now using default, but this should come from server
            // In a real implementation, AC would be stored per client or retrieved from server
            const targetAc = ac || 10 // Using own AC as placeholder, should be target's AC
            
            const hit = roll > targetAc
            let damage = 0
            if (hit) {
              damage = selectedAbility.ability.baseDamage
              // Send damage to server via WebSocket
              const ws = websocketRef.current
              if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'attack',
                  attacker: clientId,
                  target: pieceClientId,
                  damage: damage,
                  roll: roll,
                  targetAc: targetAc,
                }))
              }
            }
            
            setDiceRolls(prev => [...prev, { roll, targetAc, hit, damage }])
            
            // Reset selection after attack
            setTimeout(() => {
              setSelectedAbility(null)
              setSelectedPiece(null)
              setRangeSquares([])
              setDiceRolls([])
              if (onAttackStateChange) onAttackStateChange(false)
            }, 3000)
          }
        }
      } else {
        // Just select the piece (for viewing)
        setSelectedPiece(pieceClientId)
      }
    }
  }

  const handleAbilitySelect = (ability: AttackAbility, type: 'melee' | 'ranged') => {
    // If clicking the same ability that's already selected, deselect it
    if (selectedAbility?.ability.attackName === ability.attackName && selectedAbility?.type === type) {
      setSelectedAbility(null)
      setRangeSquares([])
      if (onAttackStateChange) onAttackStateChange(false)
      return
    }
    
    // Auto-select own piece if not already selected
    if (selectedPiece !== clientId) {
      setSelectedPiece(clientId)
    }
    
    setSelectedAbility({ ability, type })
    if (onAttackStateChange) onAttackStateChange(true)
    const position = boardPositions.get(clientId)
    
    if (position) {
      const squares = calculateRangeSquares(position, ability.range)
      setRangeSquares(squares)
    } else {
      // If no position yet, clear range squares
      setRangeSquares([])
    }
  }

  return (
    <div className="hidden sm:block lg:mt-[2%] mt-[5%] w-full">
      <div className="flex gap-4 items-start justify-center w-full max-w-full">
        {/* Left HUD Panel */}
        <div className="flex-shrink-0 w-64 bg-stone-900/90 border-2 border-stone-700 rounded-[16px] p-4 backdrop-blur-sm shadow-xl">
          {/* Character Portrait */}
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
              {/* Character Description */}
              {charDescription && (
                <div className="mt-2 text-sm text-stone-300 leading-relaxed">
                  {charDescription}
                </div>
              )}
              {/* Race */}
              {race && (
                <div className="mt-2 text-sm text-stone-200 font-semibold">
                  Race: <span className="text-stone-300 font-normal">{race}</span>
                </div>
              )}
            </div>
          )}

          {/* HP Bar */}
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
                    width: hp !== null && maxHp !== null && maxHp > 0 
                      ? `${(hp / maxHp) * 100}%` 
                      : '0%' 
                  }}
                />
              </div>
              {/* AC Display */}
              {ac !== null && (
                <div className="mt-2 flex justify-between items-center">
                  <span className="text-sm font-semibold text-stone-200">AC</span>
                  <span className="text-sm text-stone-300">{ac}</span>
                </div>
              )}
            </div>
          )}

          {/* Available Actions / Abilities */}
          {characterCreated && (
            <div className={`mb-4 ${selectedPiece === clientId ? 'ring-2 ring-yellow-400 rounded-lg p-2' : ''}`}>
              <h3 className="text-base font-semibold text-stone-200 mb-2">Available Actions</h3>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {abilities ? (() => {
                  const allAbilities: { ability: AttackAbility; type: 'melee' | 'ranged' }[] = [];
                  if (abilities.melee) {
                    abilities.melee.forEach(ability => {
                      allAbilities.push({ ability, type: 'melee' });
                    });
                  }
                  if (abilities.ranged) {
                    abilities.ranged.forEach(ability => {
                      allAbilities.push({ ability, type: 'ranged' });
                    });
                  }
                  return allAbilities.length > 0 ? (
                    <>
                      {allAbilities.map((item, index) => {
                        const isSelected = selectedAbility?.ability.attackName === item.ability.attackName && 
                                          selectedAbility?.type === item.type
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
                            {isSelected && diceRolls.length > 0 && (
                              <div className="mt-1 px-2 space-y-1">
                                {diceRolls.map((roll, rollIndex) => (
                                  <div key={rollIndex} className="text-sm text-stone-400">
                                    Roll: {roll.roll} vs AC {roll.targetAc} - {roll.hit ? `Hit! ${roll.damage} damage` : 'Miss'}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </>
                  ) : (
                    <div className="text-sm text-stone-500 italic">No abilities available</div>
                  );
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

          {/* Character Stats or Create Character Button */}
          <div>
            {characterCreated ? (
              <>
                <h3 className="text-base font-semibold text-stone-200 mb-2">Stats</h3>
                <div className="space-y-1">
                  {stats ? (
                    <>
                      {stats.str !== undefined && (
                        <div className="flex justify-between text-sm text-stone-300">
                          <span>STR:</span>
                          <span className="font-semibold">{stats.str}</span>
                        </div>
                      )}
                      {stats.dex !== undefined && (
                        <div className="flex justify-between text-sm text-stone-300">
                          <span>DEX:</span>
                          <span className="font-semibold">{stats.dex}</span>
                        </div>
                      )}
                      {stats.con !== undefined && (
                        <div className="flex justify-between text-sm text-stone-300">
                          <span>CON:</span>
                          <span className="font-semibold">{stats.con}</span>
                        </div>
                      )}
                      {stats.int !== undefined && (
                        <div className="flex justify-between text-sm text-stone-300">
                          <span>INT:</span>
                          <span className="font-semibold">{stats.int}</span>
                        </div>
                      )}
                      {stats.wis !== undefined && (
                        <div className="flex justify-between text-sm text-stone-300">
                          <span>WIS:</span>
                          <span className="font-semibold">{stats.wis}</span>
                        </div>
                      )}
                      {stats.chr !== undefined && (
                        <div className="flex justify-between text-sm text-stone-300">
                          <span>CHR:</span>
                          <span className="font-semibold">{stats.chr}</span>
                        </div>
                      )}
                      {/* Show any other stats that might be present */}
                      {Object.entries(stats).map(([key, value]) => {
                        if (!['str', 'dex', 'con', 'int', 'wis', 'chr'].includes(key.toLowerCase())) {
                          return (
                            <div key={key} className="flex justify-between text-sm text-stone-300">
                              <span className="uppercase">{key}:</span>
                              <span className="font-semibold">{value}</span>
                            </div>
                          );
                        }
                        return null;
                      })}
                    </>
                  ) : (
                    <div className="text-sm text-stone-500 italic">No stats available</div>
                  )}
                </div>
                
                {/* Traits */}
                {traits.length > 0 && (
                  <div className="mt-4">
                    <button
                      onClick={() => setTraitsExpanded(!traitsExpanded)}
                      className="w-full text-left text-sm font-semibold text-stone-200 mb-2 flex items-center justify-between"
                    >
                      <span>Traits</span>
                      <span className="text-xs">{traitsExpanded ? '▼' : '▶'}</span>
                    </button>
                    {traitsExpanded && (
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
          <DndContext onDragEnd={handleDragEnd}>
            <div
              ref={boardRef}
              data-map-board
              className="relative w-full aspect-square max-w-2xl mx-auto border-stone-700 border-2 rounded-[24px] overflow-hidden"
              style={{
                background:
                  'linear-gradient(94.15deg, rgba(68, 64, 60, 0.4) 0%, rgba(41, 37, 36, 0.5) 100%)',
              }}
            >
              <div className="grid grid-cols-10 h-full w-full" style={{ gap: '0' }}>
                {Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, index) => {
                  const row = Math.floor(index / BOARD_SIZE)
                  const col = index % BOARD_SIZE
                  const position: BoardPosition = { row, col }

                  // Find if any piece is on this square
                  let pieceClientId: string | null = null
                  boardPositions.forEach((pos, cid) => {
                    if (pos.row === row && pos.col === col) {
                      pieceClientId = cid
                    }
                  })

                  // Check if this square is in attack range
                  const isInRange = rangeSquares.some(
                    sq => sq.row === row && sq.col === col
                  )

                  // Handle click on square when attack is selected
                  const handleSquareClick = () => {
                    if (selectedAbility && selectedPiece === clientId) {
                      // Check if there's a target at this position
                      let targetClientId: string | null = null
                      boardPositions.forEach((pos, cid) => {
                        if (pos.row === row && pos.col === col && cid !== clientId) {
                          targetClientId = cid
                        }
                      })
                      if (targetClientId) {
                        handlePieceSelect(targetClientId)
                      }
                    }
                  }

                  return (
                    <ChessSquare 
                      key={`${row}-${col}`} 
                      row={row} 
                      col={col}
                      isInRange={isInRange}
                      onClick={handleSquareClick}
                    >
                      {pieceClientId && (
                        <ChessPiece 
                          clientId={pieceClientId} 
                          position={position}
                          isSelected={selectedPiece === pieceClientId}
                          onSelect={() => handlePieceSelect(pieceClientId!)}
                          isDraggingDisabled={pieceClientId === clientId && selectedAbility !== null}
                        />
                      )}
                    </ChessSquare>
                  )
                })}
              </div>
            </div>
          </DndContext>
        </div>

        {/* Right HUD Panel */}
        <div className="flex-shrink-0 w-64 bg-stone-900/90 border-2 border-stone-700 rounded-[16px] p-4 backdrop-blur-sm shadow-xl">
          {/* Inventory */}
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

          {/* Current Quest */}
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

