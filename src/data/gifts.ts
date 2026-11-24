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

/** confirmed = the guest marked "Já comprei"; it leaves the catalog but counts toward progress. */
export type GiftStatus = "available" | "reserved" | "confirmed";

export interface Gift {
  id: string;
  room: RoomId;
  name: string;
  store: "Amazon" | "Shopee" | "Mercado Livre";
  price: number;
  url: string;
  photos: Photo[];
  description: string;
  brand: string;
  model: string;
  dims?: string;
  variants?: string[];
  status: GiftStatus;
}

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

const p = (id: string, alt: string): Photo => ({ id, alt });
// Store search links stand in for the real listings the couple will register.
const link = (shop: Gift["store"], q: string) => {
  const term = encodeURIComponent(q);
  if (shop === "Shopee") return `https://shopee.com.br/search?keyword=${term}`;
  if (shop === "Mercado Livre") return `https://lista.mercadolivre.com.br/${term}`;
  return `https://www.amazon.com.br/s?k=${term}`;
};

// shortcut: sample catalog for the visual review; real products come from the couple's panel (Supabase)
export const GIFTS: Gift[] = [
  // Sala
  { id: "luminaria-piso", room: "sala", name: "Luminária de piso articulada", store: "Amazon", price: 489, url: link("Amazon", "luminária de piso articulada"),
    photos: [p("1507473885765-e6ed057f782c", "Luminária de piso cinza com cúpula articulada")],
    description: "Haste em aço com cúpula orientável, para ler no canto do sofá.", brand: "Tok&Stok", model: "Arc 160", dims: "160 cm", variants: ["Grafite", "Areia"], status: "available" },
  { id: "vela-vidro", room: "sala", name: "Vela aromática em copo de vidro", store: "Shopee", price: 89, url: link("Shopee", "vela aromática copo de vidro"),
    photos: [p("1602874801007-bd458bb1b8b6", "Vela acesa em copo de vidro")],
    description: "Cera vegetal com notas de figo e madeira, cerca de 40 horas de queima.", brand: "Casa Lume", model: "Figo 220 g", dims: "Ø 8 cm", variants: ["Figo", "Alecrim"], status: "available" },
  { id: "caixa-som", room: "sala", name: "Caixa de som Bluetooth", store: "Mercado Livre", price: 649, url: link("Mercado Livre", "caixa de som bluetooth à prova d'água"),
    photos: [p("1608043152269-423dbba4e7e1", "Caixa de som cilíndrica preta sobre uma mesa de madeira")],
    description: "Som potente para a sala e resistente à água para levar para fora.", brand: "JBL", model: "Flip", dims: "18 cm", status: "reserved" },
  { id: "tapete", room: "sala", name: "Tapete de sala", store: "Amazon", price: 720, url: link("Amazon", "tapete sala 2x3"),
    photos: [p("1600166898405-da9535204843", "Tapetes enrolados com padrão clássico em tons claros")],
    description: "Trama baixa em tons de areia, fácil de aspirar.", brand: "São Carlos", model: "Lisboa", dims: "200 × 300 cm", status: "available" },
  { id: "sala-c1", room: "sala", name: "Manta de tricô", store: "Shopee", price: 159, url: link("Shopee", "manta tricô sofá"),
    photos: [p("1578500494198-246f612d3b3d", "Manta sobre o sofá")], description: "", brand: "", model: "", status: "confirmed" },

  // Cozinha
  { id: "cafeteira", room: "cozinha", name: "Cafeteira com moedor", store: "Amazon", price: 1290, url: link("Amazon", "cafeteira com moedor"),
    photos: [
      p("1570222094114-d054a817e56b", "Cafeteira elétrica e moedor de café sobre a bancada"),
      p("1517668808822-9ebb02f2a0e6", "Grãos de café torrados de perto"),
      p("1565538810643-b5bdb714032a", "Bancada da cozinha onde a cafeteira vai ficar"),
    ],
    description: "Moe os grãos na hora e passa até 10 xícaras. Jarra térmica que mantém o café quente por horas.", brand: "Oster", model: "Grind & Brew", dims: "38 cm", variants: ["Inox", "Preto"], status: "available" },
  { id: "chaleira", room: "cozinha", name: "Chaleira de inox", store: "Mercado Livre", price: 219, url: link("Mercado Livre", "chaleira inox fogão"),
    photos: [p("1594213114663-d94db9b17125", "Chaleira de inox polido")],
    description: "Inox polido com alça firme, para fogão a gás ou indução.", brand: "Tramontina", model: "Allegra 2 L", dims: "2 L", status: "available" },
  { id: "facas", room: "cozinha", name: "Jogo de facas com estojo", store: "Amazon", price: 399, url: link("Amazon", "jogo de facas com estojo"),
    photos: [p("1593618998160-e34014e67546", "Cinco facas com cabo de madeira ao lado de um estojo de couro")],
    description: "Cinco peças em aço carbono com cabo de madeira e estojo enrolável.", brand: "Tramontina", model: "Century", dims: "5 peças", status: "available" },
  { id: "tigelas", room: "cozinha", name: "Tigelas e caneca de cerâmica", store: "Shopee", price: 149, url: link("Shopee", "tigelas cerâmica"),
    photos: [p("1603199506016-b9a594b593c0", "Tigelas de cerâmica empilhadas"), p("1514228742587-6b1558fcca3d", "Caneca branca de cerâmica")],
    description: "Quatro tigelas e uma caneca em cerâmica esmaltada à mão.", brand: "Oxford", model: "Artesanal", dims: "Ø 15 cm", status: "available" },
  { id: "coz-c1", room: "cozinha", name: "Jogo de panelas", store: "Amazon", price: 899, url: link("Amazon", "jogo de panelas"),
    photos: [p("1565538810643-b5bdb714032a", "Panelas")], description: "", brand: "", model: "", status: "confirmed" },
  { id: "coz-c2", room: "cozinha", name: "Liquidificador", store: "Mercado Livre", price: 349, url: link("Mercado Livre", "liquidificador"),
    photos: [p("1565538810643-b5bdb714032a", "Liquidificador")], description: "", brand: "", model: "", status: "confirmed" },

  // Banheiro
  { id: "sabonetes", room: "banheiro", name: "Kit de sabonetes artesanais", store: "Shopee", price: 79, url: link("Shopee", "sabonete artesanal kit"),
    photos: [p("1600857544200-b2f666a9a2ec", "Sabonetes artesanais amarrados com barbante e lavanda")],
    description: "Seis barras de óleos vegetais, com lavanda, aveia e mel.", brand: "Ateliê Verbena", model: "Kit 6", dims: "6 barras", status: "available" },
  { id: "frascos", room: "banheiro", name: "Frascos para sabonete e hidratante", store: "Amazon", price: 129, url: link("Amazon", "frascos dispenser banheiro"),
    photos: [p("1631729371254-42c2892f0e6e", "Três frascos brancos de banheiro sobre a bancada")],
    description: "Três frascos com válvula pump, para deixar a bancada organizada.", brand: "Coza", model: "Brilliance", dims: "500 ml", status: "available" },
  { id: "planta-banheiro", room: "banheiro", name: "Vaso com planta para banheiro", store: "Mercado Livre", price: 119, url: link("Mercado Livre", "vaso planta banheiro"),
    photos: [p("1552321554-5fefe8c9ef14", "Banheiro claro com uma planta pendente na janela")],
    description: "Jiboia em vaso autoirrigável, gosta da umidade do banho.", brand: "Flora Casa", model: "Jiboia P", dims: "25 cm", status: "available" },
  { id: "ban-c1", room: "banheiro", name: "Jogo de toalhas", store: "Amazon", price: 259, url: link("Amazon", "jogo de toalhas"),
    photos: [p("1620626011761-996317b8d101", "Toalhas")], description: "", brand: "", model: "", status: "confirmed" },

  // Quarto
  { id: "travesseiro", room: "quarto", name: "Travesseiro de plumas", store: "Amazon", price: 239, url: link("Amazon", "travesseiro de plumas"),
    photos: [p("1584100936595-c0654b55a2e2", "Travesseiro branco sobre fundo amarelo")],
    description: "Enchimento de plumas e penas com capa de algodão 233 fios.", brand: "Altenburg", model: "Pluma Suprema", dims: "50 × 70 cm", status: "available" },
  { id: "lencol", room: "quarto", name: "Jogo de lençol de algodão", store: "Mercado Livre", price: 329, url: link("Mercado Livre", "jogo de lençol algodão queen"),
    photos: [p("1616627561950-9f746e330187", "Cama com almofadas listradas e lençol claro"), p("1615874959474-d609969a20ed", "Quarto com roupa de cama verde")],
    description: "Quatro peças em percal 300 fios para cama queen.", brand: "Buddemeyer", model: "Percal 300", dims: "Queen", variants: ["Areia", "Oliva", "Branco"], status: "available" },
  { id: "abajur", room: "quarto", name: "Abajur de cabeceira", store: "Shopee", price: 189, url: link("Shopee", "abajur cabeceira"),
    photos: [p("1522771739844-6a9f6d5f14af", "Abajur de cabeceira aceso ao lado da cama")],
    description: "Luz quente e baixa para ler antes de dormir.", brand: "Luminatti", model: "Fio", dims: "45 cm", status: "available" },
  { id: "poltrona", room: "quarto", name: "Poltrona de leitura", store: "Amazon", price: 990, url: link("Amazon", "poltrona capitonê"),
    photos: [p("1567538096630-e0c55bd6374c", "Poltrona branca capitonê")],
    description: "Encosto capitonê e pés torneados, para um canto de leitura.", brand: "Mobly", model: "Lis", dims: "72 cm", status: "available" },
  { id: "qua-c1", room: "quarto", name: "Edredom", store: "Amazon", price: 459, url: link("Amazon", "edredom queen"),
    photos: [p("1615874959474-d609969a20ed", "Edredom")], description: "", brand: "", model: "", status: "confirmed" },

  // Escritório
  { id: "luminaria-mesa", room: "escritorio", name: "Luminária de mesa", store: "Amazon", price: 279, url: link("Amazon", "luminária de mesa articulada"),
    photos: [p("1534105615256-13940a56ff44", "Luminária de mesa preta articulada")],
    description: "Braço articulado e base pesada, foco direto no teclado.", brand: "Taschibra", model: "Pixar", dims: "52 cm", status: "available" },
  { id: "fone", room: "escritorio", name: "Fone de ouvido sem fio", store: "Mercado Livre", price: 899, url: link("Mercado Livre", "fone de ouvido bluetooth cancelamento de ruído"),
    photos: [p("1505740420928-5e560c06d30e", "Fone de ouvido preto sobre fundo amarelo")],
    description: "Cancelamento de ruído para as reuniões em casa.", brand: "Sony", model: "WH-CH720N", status: "reserved" },
  { id: "cadeira", room: "escritorio", name: "Cadeira de escritório", store: "Amazon", price: 549, url: link("Amazon", "cadeira eames"),
    photos: [p("1592078615290-033ee584e267", "Cadeira preta com pés de madeira")],
    description: "Assento estofado e pés de madeira, para a mesa de trabalho.", brand: "Eames", model: "DSW", dims: "81 cm", variants: ["Preta", "Branca"], status: "available" },
  { id: "caderno", room: "escritorio", name: "Caderno pautado", store: "Shopee", price: 59, url: link("Shopee", "caderno pautado capa dura"),
    photos: [p("1531346878377-a5be20888e57", "Caderno branco espiral com caneta")],
    description: "Capa dura, 160 folhas de papel pólen.", brand: "Cícero", model: "Clássico A5", dims: "A5", status: "available" },

  // Área externa
  { id: "jardinagem", room: "externa", name: "Kit de jardinagem", store: "Mercado Livre", price: 139, url: link("Mercado Livre", "kit jardinagem"),
    photos: [p("1416879595882-3373a0480b5b", "Pá de jardinagem, terra e mudas")],
    description: "Pá, ancinho e transplantador em aço com cabo emborrachado.", brand: "Tramontina", model: "Garden 3", dims: "3 peças", status: "available" },
  { id: "vasos-cimento", room: "externa", name: "Vasos de cimento com cactos", store: "Shopee", price: 99, url: link("Shopee", "vaso de cimento cacto"),
    photos: [p("1463320898484-cdee8141c787", "Dois vasos de cimento com cactos sobre a madeira")],
    description: "Dois vasos de cimento com cactos já plantados.", brand: "Flora Casa", model: "Duo", dims: "Ø 12 cm", status: "available" },
  { id: "mesa-varanda", room: "externa", name: "Mesa e cadeiras para varanda", store: "Amazon", price: 1190, url: link("Amazon", "conjunto mesa cadeiras varanda"),
    photos: [p("1519710164239-da123dc03ef4", "Mesa redonda branca com cadeira e plantas")],
    description: "Mesa redonda e duas cadeiras para o café da manhã ao ar livre.", brand: "Tramontina", model: "Ipanema", dims: "Ø 70 cm", status: "available" },
  { id: "banqueta", room: "externa", name: "Banqueta de madeira", store: "Mercado Livre", price: 210, url: link("Mercado Livre", "banqueta madeira"),
    photos: [p("1503602642458-232111445657", "Banqueta de madeira clara")],
    description: "Madeira maciça, serve de apoio para vasos ou como assento extra.", brand: "Oppa", model: "Tora", dims: "65 cm", status: "available" },
];
