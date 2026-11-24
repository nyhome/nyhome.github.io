"use client";

import Image from "next/image";
import { useRef } from "react";
import { Button } from "@astryxdesign/core/Button";
import type { Gift } from "@/data/gifts";
import { formatBRL } from "@/lib/catalog";
import { useSeenOnce } from "@/lib/hooks";
import styles from "./GiftCard.module.css";

interface Props {
  gift: Gift;
  /** Position in its row, to stagger the entrance. */
  order: number;
  onOpen: (gift: Gift, trigger: HTMLElement) => void;
}

/**
 * Product card as a spec sheet: when it scrolls in, a dimension line draws across the top (the OTTO
 * redesign's plan-view callout) and the photo is uncovered behind it.
 */
export function GiftCard({ gift, order, onOpen }: Props) {
  const ref = useRef<HTMLElement>(null);
  const seen = useSeenOnce(ref, "0px 0px -4% 0px");
  const reserved = gift.status === "reserved";
  const cover = gift.photos[0];

  return (
    <article
      ref={ref}
      className={styles.card}
      data-shown={seen || undefined}
      style={{ "--delay": `${(order % 3) * 90}ms` } as React.CSSProperties}
    >
      <div className={styles.dim} aria-hidden>
        <span className={styles.line} />
        {gift.dims && <span className={styles.dimLabel}>{gift.dims}</span>}
      </div>
      <button
        type="button"
        className={styles.photo}
        onClick={(e) => onOpen(gift, e.currentTarget)}
        aria-label={`Ver detalhes: ${gift.name}`}
      >
        <Image
          src={`https://images.unsplash.com/photo-${cover.id}`}
          alt={cover.alt}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1100px) 50vw, 33vw"
        />
        {reserved && <span className={styles.badge}>Reservado</span>}
      </button>
      <div className={styles.body}>
        <h3 className={styles.name}>{gift.name}</h3>
        <p className={styles.meta}>
          <span>{gift.store}</span>
          <span className={styles.price}>{formatBRL(gift.price)}</span>
        </p>
        <div>
          <Button
            label={`Ver detalhes de ${gift.name}`}
            variant="ghost"
            size="sm"
            onClick={(e) => onOpen(gift, e.currentTarget as HTMLElement)}
          >
            Ver detalhes
          </Button>
        </div>
      </div>
    </article>
  );
}
