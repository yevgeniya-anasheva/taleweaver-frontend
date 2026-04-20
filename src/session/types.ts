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
}

