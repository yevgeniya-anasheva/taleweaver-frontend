import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { useForm } from 'react-hook-form'
import type { MouseCoordinates, CharacterAbilities, InventoryItem, CharacterTrait } from './session/types'
import { attachRoomSocketHandlers } from './session/room'
import type { RoomHandlerContext } from './session/room'
import { convertMarkdownToHtml } from './utils/formatting'
import { Home } from './components/Home'
import { Map } from './components/Map'
import { Navbar } from './components/Navbar'

interface AppFormData {
  joinRoomId: string
  worldPrompt: string
}

interface GameState {
  clientCoordinates: globalThis.Map<string, MouseCoordinates>
  isRoomConnected: boolean
  roomId: string | null
  errorMessage: string
  isHost: boolean
  gameStatusMessage: string
  gameSetting: string
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
  isAttacking: boolean
}

function App() {
  const lastSentRef = useRef<number>(0);
  const isMousePressedRef = useRef<boolean>(false);
  const throttleDelay = 100; // Send coordinates at most every 100ms
  const MIN_WORLD_PROMPT_LENGTH = 5;

  // Use React Hook Form for form inputs
  const { register, watch, setValue } = useForm<AppFormData>({
    defaultValues: {
      joinRoomId: '',
      worldPrompt: '',
    },
  });

  // Watch form values without causing rerenders
  const joinRoomId = watch('joinRoomId');
  const worldPrompt = watch('worldPrompt');

  // Consolidated game state using a single useState
  const [gameState, setGameState] = useState<GameState>({
    clientCoordinates: new globalThis.Map(),
    isRoomConnected: false,
    roomId: null,
    errorMessage: '',
    isHost: false,
    gameStatusMessage: '',
    gameSetting: '',
    characterPortrait: null,
    hp: null,
    maxHp: null,
    ac: null,
    actions: [],
    abilities: null,
    stats: null,
    inventory: [],
    quest: null,
    characterCreated: false,
    charDescription: null,
    race: null,
    traits: [],
    isAttacking: false,
  });

  // Helper function to update game state
  const updateGameState = (updates: Partial<GameState>) => {
    setGameState(prev => ({ ...prev, ...updates }));
  };

  // Generate a unique client ID that persists for the session
  const clientIdRef = useRef<string>(
    `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
  );

  const websocketRef = useRef<WebSocket | null>(null);
  const roomModeRef = useRef<'create' | 'join' | null>(null);
  const joinRoomIdRef = useRef<string>('');
  const cleanupTimeoutRef = useRef<number | null>(null);

  // Calculate game result container height based on coordinate count
  const COORDINATE_MIN_HEIGHT = 280;
  const COORDINATE_MAX_HEIGHT = 600;
  const coordinateHeightValue =
    gameState.clientCoordinates.size > 0
      ? Math.max(
          COORDINATE_MIN_HEIGHT,
          Math.min(COORDINATE_MAX_HEIGHT, 20 + gameState.clientCoordinates.size * 140 + 20),
        )
      : COORDINATE_MIN_HEIGHT;
  const gameResultContainerHeight = `${coordinateHeightValue * 2}px`;

  const getRoomHandlerContext = (): RoomHandlerContext => ({
    websocketRef,
    roomModeRef,
    joinRoomIdRef,
    clientIdRef,
    setRoomId: (value) => updateGameState({ roomId: typeof value === 'function' ? value(gameState.roomId) : value }),
    setIsRoomConnected: (value) => updateGameState({ isRoomConnected: typeof value === 'function' ? value(gameState.isRoomConnected) : value }),
    setIsHost: (value) => updateGameState({ isHost: typeof value === 'function' ? value(gameState.isHost) : value }),
    setErrorMessage: (value) => updateGameState({ errorMessage: typeof value === 'function' ? value(gameState.errorMessage) : value }),
    setGameStatusMessage: (value) => updateGameState({ gameStatusMessage: typeof value === 'function' ? value(gameState.gameStatusMessage) : value }),
    setWorldPrompt: (value) => {
      const newValue = typeof value === 'function' ? value(worldPrompt) : value;
      setValue('worldPrompt', newValue);
    },
    setClientCoordinates: (value) => updateGameState({ clientCoordinates: typeof value === 'function' ? value(gameState.clientCoordinates) : value }),
    setGameSetting: (value) => updateGameState({ gameSetting: typeof value === 'function' ? value(gameState.gameSetting) : value }),
    setCharacterPortrait: (value) => updateGameState({ characterPortrait: typeof value === 'function' ? value(gameState.characterPortrait) : value }),
    setHp: (value) => updateGameState({ hp: typeof value === 'function' ? value(gameState.hp) : value }),
    setMaxHp: (value) => updateGameState({ maxHp: typeof value === 'function' ? value(gameState.maxHp) : value }),
    setAc: (value) => updateGameState({ ac: typeof value === 'function' ? value(gameState.ac) : value }),
    setActions: (value) => updateGameState({ actions: typeof value === 'function' ? value(gameState.actions) : value }),
    setAbilities: (value) => updateGameState({ abilities: typeof value === 'function' ? value(gameState.abilities) : value }),
    setStats: (value) => updateGameState({ stats: typeof value === 'function' ? value(gameState.stats) : value }),
    setInventory: (value) => updateGameState({ inventory: typeof value === 'function' ? value(gameState.inventory) : value }),
    setQuest: (value) => updateGameState({ quest: typeof value === 'function' ? value(gameState.quest) : value }),
    setCharacterCreated: (value) => updateGameState({ characterCreated: typeof value === 'function' ? value(gameState.characterCreated) : value }),
    setCharDescription: (value) => updateGameState({ charDescription: typeof value === 'function' ? value(gameState.charDescription) : value }),
    setRace: (value) => updateGameState({ race: typeof value === 'function' ? value(gameState.race) : value }),
    setTraits: (value) => updateGameState({ traits: typeof value === 'function' ? value(gameState.traits) : value }),
    setIsAttacking: (value) => updateGameState({ isAttacking: typeof value === 'function' ? value(gameState.isAttacking) : value }),
  });

  const roomHandlerContext = getRoomHandlerContext();

  const formattedGameHtml = useMemo(
    () => convertMarkdownToHtml(gameState.gameStatusMessage),
    [gameState.gameStatusMessage],
  );

  useEffect(() => {
    // Check URL parameters for room ID
    const params = new URLSearchParams(window.location.search);
    const roomIdParam = params.get('room');
    
    if (roomIdParam) {
      setValue('joinRoomId', roomIdParam);
      joinRoomIdRef.current = roomIdParam;
      roomModeRef.current = 'join';
    }
  }, [setValue]);

  useEffect(() => {
    // Clear any pending cleanup timeout from previous mount
    if (cleanupTimeoutRef.current) {
      clearTimeout(cleanupTimeoutRef.current);
      cleanupTimeoutRef.current = null;
    }
    
    // Initialize WebSocket connection
    if (!websocketRef.current) {
      const ws = new WebSocket('ws://localhost:8765/');
      websocketRef.current = ws;
      attachRoomSocketHandlers(ws, roomHandlerContext);

      ws.onopen = () => {
        console.log("Connected");
        
        if (roomModeRef.current === 'join' && joinRoomIdRef.current) {
          ws.send(JSON.stringify({
            action: "join",
            room: joinRoomIdRef.current,
            token: "optional-secret"
          }));
        } else if (roomModeRef.current === 'create') {
          ws.send(JSON.stringify({
            action: "create",
            token: "optional-secret"
          }));
        }
      };
    }

    // Cleanup function
    return () => {
      // Don't close WebSocket immediately - let it persist across Strict Mode re-mounts
      // Only close if component truly unmounts (after a delay)
      // The WebSocket will be reused if component re-mounts quickly
      cleanupTimeoutRef.current = window.setTimeout(() => {
        if (websocketRef.current) {
          const ws = websocketRef.current;
          // Only close if still in connecting state (connection failed) or if already closed
          // Don't close if it's open - let it stay open for re-mounts
          if (ws.readyState === WebSocket.CONNECTING) {
            // If still connecting after timeout, close it
            ws.close(1000, 'Connection timeout');
            websocketRef.current = null;
          } else if (ws.readyState === WebSocket.CLOSED) {
            websocketRef.current = null;
          }
          // If OPEN, keep it open for re-use
        }
        cleanupTimeoutRef.current = null;
      }, 100); // Small delay to detect if component re-mounts quickly
    };
  }, []);


  useEffect(() => {
    // Only set up mouse listeners if room is connected
    if (!gameState.isRoomConnected) {
      return;
    }

    // Helper function to check if coordinates are within map board bounds
    const isWithinMapBounds = (x: number, y: number, event?: MouseEvent): boolean => {
      // If event is provided, check if the target is a UI element (button, input, etc.)
      if (event) {
        const target = event.target as HTMLElement;
        // Don't track if clicking on interactive UI elements outside the board
        if (target.tagName === 'BUTTON' || 
            target.tagName === 'INPUT' || 
            target.tagName === 'TEXTAREA' ||
            target.closest('button') ||
            target.closest('input') ||
            target.closest('textarea')) {
          // Check if this UI element is inside the map board
          const boardElement = document.querySelector('[data-map-board]') as HTMLElement;
          if (!boardElement || !boardElement.contains(target)) {
            return false;
          }
        }
      }
      
      // Find the map board element
      const boardElement = document.querySelector('[data-map-board]') as HTMLElement;
      if (!boardElement) {
        return false;
      }
      
      const rect = boardElement.getBoundingClientRect();
      return (
        x >= rect.left &&
        x <= rect.right &&
        y >= rect.top &&
        y <= rect.bottom
      );
    };

    // Helper function to send mouse coordinates
    const sendMouseCoordinates = (event: MouseEvent, bypassThrottle: boolean = false) => {
      // Only send if room is connected
      if (!gameState.isRoomConnected) {
        return;
      }

      // Don't send coordinates if an attack is selected
      if (gameState.isAttacking) {
        return;
      }

      // Only send coordinates if mouse is within map board bounds
      if (!isWithinMapBounds(event.clientX, event.clientY, event)) {
        return;
      }

      const now = Date.now();
      
      // Throttle the sending to avoid too many messages (unless bypassing for clicks)
      if (!bypassThrottle && now - lastSentRef.current < throttleDelay) {
        return;
      }

      const mouseData = {
        clientId: clientIdRef.current,
        x: event.clientX,
        y: event.clientY,
        timestamp: now
      };

      // Only send if WebSocket is open and room is connected
      const ws = websocketRef.current;
      if (ws && ws.readyState === WebSocket.OPEN && gameState.isRoomConnected) {
        ws.send(JSON.stringify(mouseData));
        lastSentRef.current = now;
      }
    };

    // Mouse move handler - only send when mouse button is pressed
    const handleMouseMove = (event: MouseEvent) => {
      // Only send coordinates if mouse button is pressed
      if (!isMousePressedRef.current) {
        return;
      }

      sendMouseCoordinates(event, false);
    };

    // Mouse down handler - send coordinates immediately on every click (bypass throttle)
    const handleMouseDown = (event: MouseEvent) => {
      // Only track if within map bounds and not clicking on UI elements
      if (!isWithinMapBounds(event.clientX, event.clientY, event)) {
        isMousePressedRef.current = false;
        return;
      }
      
      isMousePressedRef.current = true;
      // Send coordinates immediately when mouse is clicked (bypass throttle to ensure it sends)
      sendMouseCoordinates(event, true);
    };

    // Mouse up handler - clear flag when mouse button is released
    const handleMouseUp = () => {
      isMousePressedRef.current = false;
    };

    // Add event listeners
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);

    // Cleanup function
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [gameState.isRoomConnected, gameState.isAttacking]);

  const requestNewGame = (setting: string) => {
    const ws = websocketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      updateGameState({ errorMessage: 'Unable to generate world: connection is not ready.' });
      return;
    }

    updateGameState({
      errorMessage: '',
      gameSetting: setting,
      gameStatusMessage: 'Generating new world...',
    });

    ws.send(JSON.stringify({
      action: "create_game",
      setting,
      room: gameState.roomId ?? undefined,
    }));
  };


  const requestCharacterCreation = () => {
    const ws = websocketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      updateGameState({ errorMessage: 'Unable to create character: connection is not ready.' });
      return;
    }

    updateGameState({ errorMessage: '' });
    ws.send(JSON.stringify({
      action: "create_character",
      room: gameState.roomId ?? undefined,
      clientId: clientIdRef.current,
    }));
  };

  const handleGenerateWorld = (event?: FormEvent<HTMLFormElement>) => {
    if (event) {
      event.preventDefault();
    }
    if (!gameState.isHost) {
      updateGameState({ errorMessage: 'Only the room host can generate a new world.' });
      return;
    }
    const trimmedPrompt = worldPrompt.trim();
    if (trimmedPrompt.length < MIN_WORLD_PROMPT_LENGTH) {
      return;
    }

    requestNewGame(trimmedPrompt);
  };

  const handleWorldPromptKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (gameState.isHost && worldPrompt.trim().length >= MIN_WORLD_PROMPT_LENGTH) {
        handleGenerateWorld();
      }
    }
  };

  const canGenerateWorld = gameState.isHost && worldPrompt.trim().length >= MIN_WORLD_PROMPT_LENGTH;

  if (!gameState.isRoomConnected) {
    return (
      <Home
        joinRoomId={joinRoomId}
        setJoinRoomId={(value) => setValue('joinRoomId', typeof value === 'function' ? value(joinRoomId) : value)}
        errorMessage={gameState.errorMessage}
        roomId={gameState.roomId}
        roomHandlerContext={roomHandlerContext}
      />
    )
  }
  
  return (
    <section className="xl:w-7/10 w-9/10 mx-auto mb-[120px]">
      <Navbar roomId={gameState.roomId} />
      <Map
        clientCoordinates={gameState.clientCoordinates}
        websocketRef={websocketRef}
        clientId={clientIdRef.current}
        isRoomConnected={gameState.isRoomConnected}
        characterPortrait={gameState.characterPortrait}
        hp={gameState.hp}
        maxHp={gameState.maxHp}
        ac={gameState.ac}
        actions={gameState.actions}
        abilities={gameState.abilities}
        stats={gameState.stats}
        inventory={gameState.inventory}
        quest={gameState.quest}
        characterCreated={gameState.characterCreated}
        charDescription={gameState.charDescription}
        race={gameState.race}
        traits={gameState.traits}
        onRequestCharacterCreation={requestCharacterCreation}
        onAttackStateChange={(value) => updateGameState({ isAttacking: value })}
      />
      
      {/* World generation form */}
      <div className="mt-8 w-full">
        {gameState.gameStatusMessage && (
          <div className="mb-6 w-full">
            <div
              className="rounded-[24px] border-2 border-stone-700 bg-stone-900/80 shadow-inner backdrop-blur-sm"
              style={{
                height: gameResultContainerHeight,
                maxHeight: `${COORDINATE_MAX_HEIGHT * 2}px`,
              }}
            >
              <div className="h-full overflow-y-auto px-6 py-5 text-stone-100 leading-relaxed">
                {gameState.gameSetting && (
                  <div className="mb-4">
                    <div className="text-sm font-semibold text-stone-200">Setting</div>
                    <div className="mt-1 text-sm text-stone-100">{gameState.gameSetting}</div>
                  </div>
                )}
                <div
                  className="space-y-4 text-sm text-stone-100 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:text-stone-50 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-stone-50 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-stone-50 [&_p]:leading-relaxed [&_p]:text-stone-100 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:text-stone-100 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:text-stone-100 [&_strong]:text-stone-50 [&_em]:text-stone-50"
                  dangerouslySetInnerHTML={{ __html: formattedGameHtml }}
                />
              </div>
            </div>
          </div>
        )}

        <form
          onSubmit={handleGenerateWorld}
          className="flex flex-col sm:flex-row gap-4 items-start"
        >
          <textarea
            {...register('worldPrompt')}
            className="flex-1 w-full p-4 rounded-[16px] border-2 border-stone-700 focus:border-stone-600 focus:outline-none resize-y min-h-[150px] bg-stone-800/50 text-stone-100 placeholder-stone-500"
            placeholder={gameState.isHost ? "Describe the world you want to generate..." : "Waiting for host to generate a new world..."}
            onKeyDown={handleWorldPromptKeyDown}
            disabled={!gameState.isHost}
          />

          {gameState.isHost && (
            <button
              type="submit"
              disabled={!canGenerateWorld}
              className={`whitespace-nowrap rounded-[16px] border-2 px-6 py-3 font-semibold transition-colors ${
                canGenerateWorld
                  ? "bg-stone-700 text-stone-50 border-stone-600 hover:bg-stone-600 hover:border-stone-500 shadow-lg"
                  : "bg-stone-800 text-stone-500 border-stone-700 cursor-not-allowed"
              }`}
            >
              Generate new world
            </button>
          )}
        </form>

      </div>
    </section>
  );
}

export default App;
