"use client";

import Image from "next/image";
import { useRef } from "react";
import { Button } from "@astryxdesign/core/Button";
import { OPENING_PHOTO } from "@/data/gifts";
import { useIsNarrow, useReducedMotion, useScrollProgress } from "@/lib/hooks";
import styles from "./Opening.module.css";

/**
 * Photo on the left, invitation on the right. While the visitor scrolls through the tall section the
 * photo slowly grows and the invitation drifts up toward the list (driven by `--p` in CSS).
 */
export function Opening() {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const narrow = useIsNarrow();
  useScrollProgress(ref, undefined, !reduced && !narrow);

  return (
    <section ref={ref} className={styles.opening} aria-labelledby="casal">
      <div className={styles.stage}>
        <figure className={styles.photo}>
          <Image
            src={`https://images.unsplash.com/photo-${OPENING_PHOTO.id}`}
            alt={OPENING_PHOTO.alt}
            fill
            priority
            sizes="(max-width: 860px) 100vw, 55vw"
          />
        </figure>
        <div className={styles.invite}>
          <p className={styles.kicker}>Chá de casa nova</p>
          <h1 id="casal" className={styles.names}>
            Nathália <span className={styles.amp}>&amp;</span> Yago
          </h1>
          <p className={styles.lede}>
            Estamos montando a nossa casa, cômodo por cômodo. Escolha um presente da lista, reserve pelo seu nome e
            compre na loja.
          </p>
          <div className={styles.cta}>
            <Button label="Ver lista de presentes" variant="primary" size="lg" href="#ambientes" />
          </div>
        </div>
      </div>
    </section>
  );
}
