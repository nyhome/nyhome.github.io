export type RoomId = "sala" | "cozinha" | "banheiro" | "quarto" | "escritorio" | "servico";

export interface Photo {
  /** Unsplash photo id, the part after `photo-` in the image URL. */
  id: string;
  alt: string;
}

export interface Room {
  id: RoomId;
  name: string;
  photo: Photo;
}

/** draft = only admins see it; bought = every unit bought (by guests or the couple). Holds live in `holds`. */
export type GiftStatus = "draft" | "available" | "bought";

export interface GiftLink {
  store: string;
  url: string;
  coupon?: string;
}

export interface Gift {
  id: string;
  room: RoomId;
  /** Short alias for the catalog card. */
  name: string;
  /** Full model string the guest searches for at the store. */
  model: string;
  brand: string;
  description: string;
  dims?: string;
  /** Electrical items only; buying the wrong one can burn the appliance. */
  voltage?: Voltage;
  variants?: string[];
  /** Reference price, used by the price filters. */
  price: number;
  /** Lowest price ever saved (or typed in by the couple from elsewhere); never above price. */
  lowestPrice: number;
  links: GiftLink[];
  photos: string[];
  status: GiftStatus;
  /** Published but taken off the catalog by the couple (the toggle in the panel). */
  hidden?: boolean;
  /** Units wanted; guests each give some (one reservation per guest). Single gifts are just quantity 1. */
  quantity: number;
  boughtUnits: number;
  /** Units inside active holds; kept as a counter because security rules can't sum the holds map. */
  heldUnits: number;
  /** Public side of each active reservation, keyed by a random hold id (the reservation token stays secret). */
  holds: Record<string, Hold>;
  /** Who gave the bought units, in order. */
  givers: Giver[];
}

export interface Hold {
  units: number;
  /** Epoch ms; the hold ends 72h later (see HOLD_HOURS). */
  reservedAt: number;
  giverName: string;
  giverTier: string;
}

export interface Giver {
  name: string;
  tier: string;
  units: number;
  /** Bought by the couple themselves ("Comprado pelos noivos"). */
  byCouple?: boolean;
}

// Same list as VOLTAGES in scripts/api.mjs.
export const VOLTAGES = ["127V", "220V", "Bivolt"] as const;
export type Voltage = (typeof VOLTAGES)[number];

export interface Delivery {
  recipient: string;
  address: string;
}

// Same list (and order) as tiers() in firestore.rules.
export const TIERS = [
  "Amigo", "Amiga", "Família", "Pai", "Mãe", "Irmão", "Irmã", "Avô", "Avó",
  "Tio", "Tia", "Primo", "Prima", "Padrinho", "Madrinha",
] as const;

export const OPENING_PHOTO: Photo = {
  id: "1600210492486-724fe5c67fb0",
  alt: "Sala ensolarada com sofá de couro, poltronas claras e plantas",
};

export const ROOMS: Room[] = [
  { id: "sala", name: "Sala", photo: { id: "1578500494198-246f612d3b3d", alt: "Sala com sofá bege e um vaso de capim-dos-pampas" } },
  { id: "cozinha", name: "Cozinha", photo: { id: "1565538810643-b5bdb714032a", alt: "Cozinha clara com bancada branca e temperos frescos" } },
  { id: "banheiro", name: "Banheiro", photo: { id: "1620626011761-996317b8d101", alt: "Banheiro branco com banheira e plantas" } },
  { id: "quarto", name: "Quarto", photo: { id: "1615874959474-d609969a20ed", alt: "Quarto com roupa de cama verde e luz natural" } },
  { id: "escritorio", name: "Escritório", photo: { id: "1524758631624-e2822e304c36", alt: "Escritório iluminado com poltronas e luminária de piso" } },
  { id: "servico", name: "Área de serviço", photo: { id: "1778731660248-044f78e8c1fb", alt: "Lavanderia com lavadora e secadora lado a lado e cestos na bancada" } },
];
