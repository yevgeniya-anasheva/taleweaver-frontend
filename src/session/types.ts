export interface MouseCoordinates {
  clientId?: string;
  x: number;
  y: number;
  timestamp: number;
}

export interface CharacterTrait {
  traitName: string;
  traitDescription: string;
}

export interface AttackAbility {
  attackName: string;
  baseDamage: number;
  range: number;
}

export interface CharacterAbilities {
  melee?: AttackAbility[];
  ranged?: AttackAbility[];
}

export interface CharacterStats {
  str?: number;
  dex?: number;
  con?: number;
  int?: number;
  wis?: number;
  chr?: number;
  [key: string]: number | undefined;
}

export interface InventoryItem {
  itemName: string;
  itemDescription: string;
}

export interface CharacterData {
  maxHp: number;
  hp: number;
  ac: number;
  race?: string;
  portrait?: string;
  class?: string;
  charDescription?: string;
  traits?: CharacterTrait[];
  stats: CharacterStats;
  abilities: CharacterAbilities;
  inventory?: InventoryItem[];
}

export type TileType = 'grass' | 'forest' | 'water' | 'mountain' | 'building' | string;
export type DoorSide = 'top' | 'bottom' | 'left' | 'right' | null;

export interface WorldTile {
  id: string;
  type: TileType;
  door: DoorSide;
  rel_x: number;
  rel_y: number;
  world_x: number;
  world_y: number;
}

export interface Viewport {
  start_x: number;
  start_y: number;
  size: number;
}

export interface WorldSize {
  width: number;
  height: number;
}

export interface PlayerPosition {
  x: number;
  y: number;
}

export type PlayerPositions = Record<string, PlayerPosition>;

export interface WorldState {
  tiles: WorldTile[];
  viewport: Viewport;
  worldSize: WorldSize;
  playerPositions: PlayerPositions;
}

export type MoveDirection = 'up' | 'down' | 'left' | 'right';

export type MoveRejectReason =
  | 'invalid_direction'
  | 'out_of_bounds'
  | 'impassable'
  | 'too_far'
  | 'occupied'
  | 'leash';

export interface WebSocketMessage {
  type?: string;
  room?: string;
  clientId?: string;
  x?: number;
  y?: number;
  timestamp?: number;
  error?: string;
  description?: string;
  setting?: string;
  'character-portrait'?: string;
  hp?: number;
  maxHp?: number;
  actions?: string[];
  stats?: {
    strength?: number;
    agility?: number;
    intelligence?: number;
    wisdom?: number;
    [key: string]: number | undefined;
  };
  inventory?: string[] | InventoryItem[];
  quest?: {
    title?: string;
    description?: string;
    progress?: string;
  };
  // Character creation response
  character?: CharacterData;
  // Telescopic camera / viewport messages
  tiles?: WorldTile[];
  viewport?: Viewport;
  world_size?: WorldSize;
  player_positions?: PlayerPositions;
  spawn?: PlayerPosition;
  reason?: MoveRejectReason;
}

