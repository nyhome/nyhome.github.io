"use client";

import { useRef } from "react";
import { Button } from "@astryxdesign/core/Button";
import type { Gift } from "@/data/gifts";
import { formatBRL, giverLabel, isSoldOut } from "@/lib/catalog";
import { useSeenOnce, hide } from "@/lib/hooks";
import styles from "./GiftCard.module.css";

interface Props {
  gift: Gift;
  now: number;
  /** Position in its row, to stagger the entrance. */
  order: number;
  onOpen: (gift: Gift, trigger: HTMLElement) => void;
}

/**
 * Product card as a spec sheet: when it scrolls in, a dimension line draws across the top (the OTTO
 * redesign's plan-view callout) and the photo is uncovered behind it.
 */
export function GiftCard({ gift, now, order, onOpen }: Props) {
  const ref = useRef<HTMLElement>(null);
  const seen = useSeenOnce(ref, "0px 0px -4% 0px");
  const soldOut = isSoldOut(gift, now);
  const label = soldOut ? (giverLabel(gift) ?? "Esgotado") : null;
  const cover = gift.photos[0];

  return (
    <article
      ref={ref}
      className={styles.card}
      data-shown={seen || undefined}
      data-soldout={soldOut || undefined}
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
        {/* Store CDN photos: plain img, no referrer so hotlink checks don't block them. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {cover && <img src={cover} alt={gift.name} referrerPolicy="no-referrer" loading="lazy" onError={hide} />}
        {label && (
          <span className={styles.badge} data-couple={gift.byCouple || undefined}>
            {label}
          </span>
        )}
      </button>
      <div className={styles.body}>
        <h3 className={styles.name}>{gift.name}</h3>
        <p className={styles.meta}>
          <span>{soldOut ? "Esgotado" : gift.links.map((l) => l.store).join(" · ")}</span>
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
