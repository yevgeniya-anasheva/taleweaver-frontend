import type { MutableRefObject, Dispatch, SetStateAction } from 'react'

import type {
  MouseCoordinates,
  WebSocketMessage,
  WorldState,
  MoveRejectReason,
} from './types'

const DEFAULT_WEBSOCKET_URL = 'ws://localhost:8765/'
const DEFAULT_TOKEN = 'optional-secret'

export interface RoomSocketHandlersContext {
  roomModeRef: MutableRefObject<'create' | 'join' | null>
  setRoomId: Dispatch<SetStateAction<string | null>>
  setIsRoomConnected: Dispatch<SetStateAction<boolean>>
  setIsHost: Dispatch<SetStateAction<boolean>>
  setErrorMessage: Dispatch<SetStateAction<string>>
  setGameStatusMessage: Dispatch<SetStateAction<string>>
  setWorldPrompt: Dispatch<SetStateAction<string>>
  setClientCoordinates: Dispatch<SetStateAction<Map<string, MouseCoordinates>>>
  setGameSetting: Dispatch<SetStateAction<string>>
  setCharacterPortrait?: Dispatch<SetStateAction<string | null>>
  setHp?: Dispatch<SetStateAction<number | null>>
  setMaxHp?: Dispatch<SetStateAction<number | null>>
  setAc?: Dispatch<SetStateAction<number | null>>
  setActions?: Dispatch<SetStateAction<string[]>>
  setAbilities?: Dispatch<SetStateAction<import('./types').CharacterAbilities | null>>
  setStats?: Dispatch<SetStateAction<Record<string, number> | null>>
  setInventory?: Dispatch<SetStateAction<import('./types').InventoryItem[]>>
  setQuest?: Dispatch<SetStateAction<{ title?: string; description?: string; progress?: string } | null>>
  setCharacterCreated?: Dispatch<SetStateAction<boolean>>
  setCharDescription?: Dispatch<SetStateAction<string | null>>
  setRace?: Dispatch<SetStateAction<string | null>>
  setTraits?: Dispatch<SetStateAction<import('./types').CharacterTrait[]>>
  setIsAttacking?: Dispatch<SetStateAction<boolean>>
  setWorldState?: Dispatch<SetStateAction<WorldState | null>>
  setMoveRejection?: Dispatch<SetStateAction<MoveRejectReason | null>>
}

export interface RoomHandlerContext extends RoomSocketHandlersContext {
  websocketRef: MutableRefObject<WebSocket | null>
  joinRoomIdRef: MutableRefObject<string>
  clientIdRef?: MutableRefObject<string>
}

export interface RoomConnectionOptions {
  websocketUrl?: string
  token?: string
}

export function attachRoomSocketHandlers(
  ws: WebSocket,
  context: RoomSocketHandlersContext & { clientIdRef?: MutableRefObject<string> },
) {
  const {
    roomModeRef,
    setRoomId,
    setIsRoomConnected,
    setIsHost,
    setErrorMessage,
    setGameStatusMessage,
    setWorldPrompt,
    setClientCoordinates,
    setGameSetting,
    setCharacterPortrait,
    setHp,
    setMaxHp,
    setAc,
    setActions,
    setAbilities,
    setStats,
    setInventory,
    setQuest,
    setCharacterCreated,
    setCharDescription,
    setRace,
    setTraits,
    setIsAttacking,
    setWorldState,
    setMoveRejection,
    clientIdRef,
  } = context

  ws.onmessage = (event) => {
    console.log('WebSocket message received:', event.data)
    try {
      const data: WebSocketMessage = JSON.parse(event.data)
      console.log('Parsed message data:', data)

      if (data.type === 'world_state') {
        if (setWorldState && Array.isArray(data.tiles) && data.viewport && data.world_size) {
          setWorldState({
            tiles: data.tiles,
            viewport: data.viewport,
            worldSize: data.world_size,
            playerPositions: data.player_positions ?? {},
          })
        }
        return
      } else if (data.type === 'move_rejected') {
        if (setMoveRejection) {
          setMoveRejection(data.reason ?? null)
        }
        return
      } else if (data.type === 'player_joined' || data.type === 'player_left') {
        // World state will arrive immediately after; nothing else to do here.
        return
      } else if (data.type === 'room_created') {
        console.log('Room created:', data.room)
        setRoomId(data.room ?? null)
        setIsRoomConnected(true)
        setIsHost(true)
        setErrorMessage('')
        setGameSetting(data.setting ?? '')
        // Reset character state when creating room (only for the creator)
        // Only reset if this is the current client creating the room
        const messageClientId = data.clientId
        const currentClientId = clientIdRef?.current
        const isCurrentClientCreating = !messageClientId || !currentClientId || messageClientId === currentClientId
        
        if (isCurrentClientCreating) {
          if (setCharacterCreated) setCharacterCreated(false)
          if (setCharacterPortrait) setCharacterPortrait(null)
          if (setHp) setHp(null)
          if (setMaxHp) setMaxHp(null)
          if (setAc) setAc(null)
          if (setActions) setActions([])
          if (setAbilities) setAbilities(null)
          if (setStats) setStats(null)
          if (setInventory) setInventory([])
          if (setCharDescription) setCharDescription(null)
          if (setRace) setRace(null)
          if (setTraits) setTraits([])
          if (setIsAttacking) setIsAttacking(false)
        }
        if (data.room) {
          window.history.replaceState({}, '', `?room=${data.room}`)
        }
      } else if (data.type === 'room_joined' || data.type === 'joined') {
        console.log('Room joined:', data.room)
        setRoomId(data.room ?? null)
        setIsRoomConnected(true)
        setIsHost(roomModeRef.current === 'create')
        setErrorMessage('')
        setGameSetting(data.setting ?? '')
        
        // Only reset character state if THIS client is joining the room
        // Don't reset if another player joins (preserve existing character data)
        const messageClientId = data.clientId
        const currentClientId = clientIdRef?.current
        const isCurrentClientJoining = !messageClientId || !currentClientId || messageClientId === currentClientId
        
        if (isCurrentClientJoining) {
          // Reset character state only when current player joins
          if (setCharacterCreated) setCharacterCreated(false)
          if (setCharacterPortrait) setCharacterPortrait(null)
          if (setHp) setHp(null)
          if (setMaxHp) setMaxHp(null)
          if (setAc) setAc(null)
          if (setActions) setActions([])
          if (setAbilities) setAbilities(null)
          if (setStats) setStats(null)
          if (setInventory) setInventory([])
          if (setCharDescription) setCharDescription(null)
          if (setRace) setRace(null)
          if (setTraits) setTraits([])
          if (setIsAttacking) setIsAttacking(false)
        } else {
          console.log('Another player joined, preserving character data:', messageClientId)
        }
        
        if (data.room) {
          window.history.replaceState({}, '', `?room=${data.room}`)
        }
      } else if (data.room && !data.type && !data.clientId && !data.error) {
        console.log('Room info received (no type):', data.room)
        setRoomId(data.room)
        setIsRoomConnected(true)
        setIsHost(roomModeRef.current === 'create')
        setErrorMessage('')
        setGameSetting(data.setting ?? '')
        window.history.replaceState({}, '', `?room=${data.room}`)
      } else if (data.type === 'success' && data.room) {
        console.log('Success with room:', data.room)
        setRoomId(data.room)
        setIsRoomConnected(true)
        setIsHost(roomModeRef.current === 'create')
        setErrorMessage('')
        setGameSetting(data.setting ?? '')
        window.history.replaceState({}, '', `?room=${data.room}`)
      } else if (data.type === 'game_created') {
        const description = data.description ?? 'New world generated.'
        console.log('Game generated:', description)
        setGameStatusMessage(description)
        setWorldPrompt('')
        setGameSetting(data.setting ?? '')
      } else if (data.type === 'error' || data.error) {
        setErrorMessage(data.error ?? 'An error occurred')
        setIsRoomConnected(false)
        setIsHost(false)
        setGameStatusMessage('')
        setGameSetting('')
      } else if (
        !data.type &&
        data.clientId &&
        typeof data.x === 'number' &&
        typeof data.y === 'number'
      ) {
        const coordinates: MouseCoordinates = {
          clientId: data.clientId,
          x: data.x,
          y: data.y,
          timestamp: data.timestamp ?? Date.now(),
        }
        setClientCoordinates((prev) => {
          const newMap = new Map(prev)
          newMap.set(coordinates.clientId!, coordinates)
          return newMap
        })
      } else if (data['character-portrait'] !== undefined) {
        // Handle character portrait update
        if (setCharacterPortrait) {
          setCharacterPortrait(data['character-portrait'] || null)
        }
      } else if (data.type === 'hud_update' || data.hp !== undefined || data.inventory !== undefined || data.quest !== undefined) {
        // Handle HUD data updates
        if (data.hp !== undefined && setHp) {
          setHp(data.hp)
        }
        if (data.maxHp !== undefined && setMaxHp) {
          setMaxHp(data.maxHp)
        }
        if (data.actions !== undefined && setActions) {
          setActions(data.actions)
        }
        if (data.stats !== undefined && setStats) {
          // Convert stats to Record<string, number> format
          const statsRecord: Record<string, number> = {}
          Object.entries(data.stats).forEach(([key, value]) => {
            if (value !== undefined && typeof value === 'number') {
              statsRecord[key] = value
            }
          })
          setStats(statsRecord)
        }
        if (data.inventory !== undefined && setInventory) {
          // Handle both InventoryItem[] and string[] formats
          if (Array.isArray(data.inventory)) {
            if (data.inventory.length > 0 && typeof data.inventory[0] === 'string') {
              // Convert string[] to InventoryItem[]
              const items = (data.inventory as string[]).map(item => ({
                itemName: item,
                itemDescription: ''
              }))
              setInventory(items)
            } else {
              setInventory(data.inventory as import('./types').InventoryItem[])
            }
          }
        }
        if (data.quest !== undefined && setQuest) {
          setQuest(data.quest || null)
        }
        if (data['character-portrait'] !== undefined && setCharacterPortrait) {
          setCharacterPortrait(data['character-portrait'] || null)
        }
      } else if (data.character) {
        const messageClientId = data.clientId
        const currentClientId = clientIdRef?.current
        
        if (messageClientId && currentClientId) {
          if (messageClientId !== currentClientId) {
            console.log('Character data received for different client, ignoring:', messageClientId, 'current:', currentClientId)
            return
          }
        } else if (!messageClientId && !currentClientId) {
          console.log('Character data received without clientId and no current clientId, skipping')
          return
        }
        
        console.log('Character created for client:', messageClientId || currentClientId, data.character)
        if (setCharacterCreated) setCharacterCreated(true)
        if (setHp) setHp(data.character.hp)
        if (setMaxHp) setMaxHp(data.character.maxHp)
        if (setAc) setAc(data.character.ac)
        if (setCharacterPortrait) setCharacterPortrait(data.character.portrait || null)
        if (setStats) {
          const statsRecord: Record<string, number> = {}
          Object.entries(data.character.stats).forEach(([key, value]) => {
            if (value !== undefined && typeof value === 'number') {
              statsRecord[key] = value
            }
          })
          setStats(statsRecord)
        }
        if (setAbilities) setAbilities(data.character.abilities)
        if (setInventory) setInventory(data.character.inventory || [])
        if (setCharDescription) setCharDescription(data.character.charDescription || null)
        if (setRace) setRace(data.character.race || null)
        if (setTraits) setTraits(data.character.traits || [])
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error)
      const parseError =
        error instanceof Error ? error.message : 'Failed to parse message'
      setErrorMessage(`Parse Error: ${parseError}`)
    }
  }

  ws.onerror = (error) => {
    console.error('WebSocket error:', error)
    const message =
      error instanceof Error ? error.message : 'Connection error occurred'
    setErrorMessage(`WebSocket Error: ${message}`)
    setGameStatusMessage('')
    setGameSetting('')
  }

  ws.onclose = (event) => {
    if (event.code !== 1000) {
      const closeReason = event.reason || `Error code: ${event.code}`
      console.log('WebSocket disconnected', event.code, closeReason)
      if (event.code !== 1001) {
        setErrorMessage(`Connection closed: ${closeReason}`)
      }
    }
    setIsRoomConnected(false)
    setIsHost(false)
    setGameStatusMessage('')
    setGameSetting('')
  }
}

export function handleCreateRoom(
  context: RoomHandlerContext,
  options: RoomConnectionOptions = {},
) {
  const {
    websocketRef,
    roomModeRef,
    clientIdRef,
    setErrorMessage,
  } = context

  roomModeRef.current = 'create'
  setErrorMessage('')

  const ws = websocketRef.current
  const websocketUrl = options.websocketUrl ?? DEFAULT_WEBSOCKET_URL
  const token = options.token ?? DEFAULT_TOKEN
  const clientId = clientIdRef?.current

  const createPayload = JSON.stringify({
    action: 'create',
    token,
    clientId,
  })

  if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
    const newWs = new WebSocket(websocketUrl)
    websocketRef.current = newWs

    attachRoomSocketHandlers(newWs, context)

    newWs.onopen = () => {
      console.log('Connected')
      newWs.send(createPayload)
    }

    return
  }

  if (ws.readyState === WebSocket.OPEN) {
    console.log('Sending create room message')
    ws.send(createPayload)
  } else if (ws.readyState === WebSocket.CONNECTING) {
    console.log('WebSocket is connecting, will send on open')
  }
}

export function handleJoinRoom(
  context: RoomHandlerContext,
  joinRoomId: string,
  options: RoomConnectionOptions = {},
) {
  const {
    websocketRef,
    roomModeRef,
    joinRoomIdRef,
    clientIdRef,
    setErrorMessage,
  } = context

  const trimmedRoomId = joinRoomId.trim()
  if (!trimmedRoomId) {
    setErrorMessage('Please enter a room ID')
    return
  }

  roomModeRef.current = 'join'
  joinRoomIdRef.current = trimmedRoomId
  setErrorMessage('')

  const ws = websocketRef.current
  const websocketUrl = options.websocketUrl ?? DEFAULT_WEBSOCKET_URL
  const token = options.token ?? DEFAULT_TOKEN
  const clientId = clientIdRef?.current

  const joinPayload = JSON.stringify({
    action: 'join',
    room: trimmedRoomId,
    token,
    clientId,
  })

  if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
    const newWs = new WebSocket(websocketUrl)
    websocketRef.current = newWs

    attachRoomSocketHandlers(newWs, context)

    newWs.onopen = () => {
      console.log('Connected')
      newWs.send(joinPayload)
    }

    return
  }

  if (ws.readyState === WebSocket.OPEN) {
    console.log('Sending join room message')
    ws.send(joinPayload)
  } else if (ws.readyState === WebSocket.CONNECTING) {
    console.log('WebSocket is connecting, will send on open')
  }
}

