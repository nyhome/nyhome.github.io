"use client";

import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Selector } from "@astryxdesign/core/Selector";
import type { Gift, Room, RoomId } from "@/data/gifts";
import { PRICE_RANGES, roomProgress, visibleGifts, type PriceRangeId } from "@/lib/catalog";
import { useIsNarrow } from "@/lib/hooks";
import { GiftCard } from "./GiftCard";
import { ProgressDots } from "./ProgressDots";
import styles from "./Catalog.module.css";

interface Props {
  rooms: Room[];
  gifts: Gift[];
  status: "loading" | "error" | "ready";
  onRetry: () => void;
  room: RoomId | "todos";
  price: PriceRangeId;
  onRoomChange: (room: RoomId | "todos") => void;
  onPriceChange: (price: PriceRangeId) => void;
  onOpen: (gift: Gift, trigger: HTMLElement) => void;
}

/** Level 2: the gifts, grouped by room, each card drawing itself in as it scrolls into view. */
export function Catalog({ rooms, gifts, status, onRetry, room, price, onRoomChange, onPriceChange, onOpen }: Props) {
  const narrow = useIsNarrow();
  const shown = visibleGifts(gifts, room, price);
  const groups = rooms
    .filter((r) => room === "todos" || r.id === room)
    .map((r) => ({ room: r, gifts: shown.filter((g) => g.room === r.id) }))
    .filter((g) => g.gifts.length > 0);

  return (
    <section id="presentes" className={styles.section} aria-labelledby="presentes-titulo">
      <header className={styles.head}>
        <h2 id="presentes-titulo" className={styles.title}>
          Lista de presentes
        </h2>
        <p className={styles.intro}>
          Escolha um presente, veja os detalhes e reserve pelo seu nome. A compra é feita na loja.
        </p>
      </header>

      <div className={styles.filters}>
        <div className={styles.rooms}>
          {/* Seven segments don't fit a phone; the same choice becomes a dropdown there. */}
          {narrow ? (
            <Selector
              label="Cômodo"
              isLabelHidden
              size="sm"
              options={[{ value: "todos", label: "Todos os cômodos" }, ...rooms.map((r) => ({ value: r.id, label: r.name }))]}
              value={room}
              onChange={(v) => onRoomChange((v ?? "todos") as RoomId | "todos")}
            />
          ) : (
            <SegmentedControl label="Cômodo" value={room} onChange={(v) => onRoomChange(v as RoomId | "todos")} size="sm">
              <SegmentedControlItem value="todos" label="Todos" />
              {rooms.map((r) => (
                <SegmentedControlItem key={r.id} value={r.id} label={r.name} />
              ))}
            </SegmentedControl>
          )}
        </div>
        <div className={styles.price}>
          <Selector
            label="Preço"
            isLabelHidden
            size="sm"
            options={PRICE_RANGES.map((r) => ({ value: r.id, label: r.label }))}
            value={price}
            onChange={(v) => onPriceChange((v ?? "todos") as PriceRangeId)}
          />
        </div>
      </div>

      {status === "loading" ? (
        <div className={styles.empty}>
          <p>Carregando a lista…</p>
        </div>
      ) : status === "error" ? (
        <div className={styles.empty}>
          <p>Não conseguimos carregar a lista agora.</p>
          <button type="button" className={styles.reset} onClick={onRetry}>
            Tentar de novo
          </button>
        </div>
      ) : gifts.length === 0 ? (
        <div className={styles.empty}>
          <p>A lista ainda está sendo montada. Volte daqui a pouco.</p>
        </div>
      ) : groups.length === 0 ? (
        <div className={styles.empty}>
          <p>Nenhum presente disponível nessa faixa de preço.</p>
          <button type="button" className={styles.reset} onClick={() => onPriceChange("todos")}>
            Mostrar todos os preços
          </button>
        </div>
      ) : (
        groups.map(({ room: r, gifts: list }) => (
          <div key={r.id} id={`presentes-${r.id}`} className={styles.group}>
            <div className={styles.groupHead}>
              <h3 className={styles.groupName}>{r.name}</h3>
              <ProgressDots {...roomProgress(gifts, r.id)} />
            </div>
            <div className={styles.grid}>
              {list.map((g, i) => (
                <GiftCard key={g.id} gift={g} order={i} onOpen={onOpen} />
              ))}
            </div>
          </div>
        ))
      )}
    </section>
  );
}
