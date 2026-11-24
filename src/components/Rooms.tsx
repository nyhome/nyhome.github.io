"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import type { Gift, Room, RoomId } from "@/data/gifts";
import { activeIndex, photoUrl, roomProgress } from "@/lib/catalog";
import { useIsNarrow, useScrollProgress } from "@/lib/hooks";
import { BrisePhoto } from "./BrisePhoto";
import { ProgressDots } from "./ProgressDots";
import styles from "./Rooms.module.css";

interface Props {
  rooms: Room[];
  gifts: Gift[];
  onShowGifts: (room: RoomId) => void;
}

/**
 * Level 1: the house, room by room. On desktop the section is several screens tall with a pinned
 * stage; scroll progress picks the active room and its photo opens over the last one in slats.
 */
export function Rooms({ rooms, gifts, onShowGifts }: Props) {
  const narrow = useIsNarrow();
  return (
    <section id="ambientes" className={styles.section} aria-labelledby="ambientes-titulo">
      {narrow ? (
        <StackedRooms rooms={rooms} gifts={gifts} onShowGifts={onShowGifts} />
      ) : (
        <PinnedRooms rooms={rooms} gifts={gifts} onShowGifts={onShowGifts} />
      )}
    </section>
  );
}

function PinnedRooms({ rooms, gifts, onShowGifts }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const onProgress = useCallback((p: number) => setActive(activeIndex(p, rooms.length)), [rooms.length]);
  useScrollProgress(ref, onProgress);

  // Warm the cache so a slat never opens onto an empty panel.
  useEffect(() => {
    rooms.forEach((r) => {
      new Image().src = photoUrl(r.photo.id, 1400);
    });
  }, [rooms]);

  const goTo = (i: number) => {
    const el = ref.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    const travel = el.offsetHeight - window.innerHeight;
    window.scrollTo({ top: top + ((i + 0.5) / rooms.length) * travel });
  };

  const room = rooms[active];
  return (
    <div ref={ref} className={styles.track} style={{ "--n": rooms.length } as React.CSSProperties}>
      <div className={styles.stage}>
        <div className={styles.listCol}>
          <h2 id="ambientes-titulo" className={styles.title}>
            A casa, cômodo por cômodo
          </h2>
          <ol className={styles.list}>
            {rooms.map((r, i) => {
              const isActive = i === active;
              return (
                <li key={r.id} className={styles.item} data-active={isActive || undefined}>
                  <button
                    type="button"
                    className={styles.name}
                    aria-current={isActive ? "true" : undefined}
                    onClick={() => goTo(i)}
                  >
                    {r.name}
                  </button>
                  <div className={styles.detail} hidden={!isActive}>
                    <ProgressDots {...roomProgress(gifts, r.id)} compact />
                    <Button label={`Ver presentes de ${r.name.toLowerCase()}`} variant="secondary" size="sm" onClick={() => onShowGifts(r.id)}>
                      Ver presentes
                    </Button>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
        <figure className={styles.photoCol}>
          <BrisePhoto photo={room.photo} className={styles.photo} priority />
          <figcaption className={styles.caption} aria-live="polite">
            {room.name}
          </figcaption>
        </figure>
      </div>
    </div>
  );
}

function StackedRooms({ rooms, gifts, onShowGifts }: Props) {
  return (
    <div className={styles.stack}>
      <h2 id="ambientes-titulo" className={styles.title}>
        A casa, cômodo por cômodo
      </h2>
      {rooms.map((r) => (
        <article key={r.id} className={styles.card}>
          <BrisePhoto photo={r.photo} className={styles.cardPhoto} revealOnView />
          <h3 className={styles.cardName}>{r.name}</h3>
          <ProgressDots {...roomProgress(gifts, r.id)} compact />
          <div>
            <Button label={`Ver presentes de ${r.name.toLowerCase()}`} variant="secondary" size="sm" onClick={() => onShowGifts(r.id)}>
              Ver presentes
            </Button>
          </div>
        </article>
      ))}
    </div>
  );
}
