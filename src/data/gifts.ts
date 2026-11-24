export type RoomId = "sala" | "cozinha" | "banheiro" | "quarto" | "escritorio" | "externa";

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

/** draft = only admins see it; reserved = held 72h by a guest; bought = done (by a guest or by the couple). */
export type GiftStatus = "draft" | "available" | "reserved" | "bought";

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
  variants?: string[];
  /** Reference price, used by the price filters. */
  price: number;
  links: GiftLink[];
  photos: string[];
  status: GiftStatus;
  /** Epoch ms of the reservation; the hold ends 72h later (see HOLD_HOURS). */
  reservedAt: number | null;
  giverName: string | null;
  giverTier: string | null;
  byCouple: boolean;
}

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
  { id: "externa", name: "Área externa", photo: { id: "1600566753190-17f0baa2a6c3", alt: "Fachada de casa com jardim em um dia claro" } },
];
