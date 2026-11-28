"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { GOAL_PRICE, GOAL_TARGET, OPENING_PHOTO, type Goal } from "@/data/gifts";
import { formatBRL } from "@/lib/catalog";
import { fetchGoal } from "@/lib/firebase";
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
  const [goal, setGoal] = useState<Goal | null>(null);
  // Nothing saved yet: the default target, nothing saved. Failing to load just means no bar.
  useEffect(() => void fetchGoal().then((g) => setGoal(g ?? { target: GOAL_TARGET, saved: 0, price: GOAL_PRICE }), () => {}), []);

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
          <p className={styles.kicker}>Não é chá de casa nova, é chá de casa própria</p>
          <h1 id="casal" className={styles.names}>
            Nathália <span className={styles.amp}>&amp;</span> Yago
          </h1>
          <p className={styles.lede}>
            Calma, não é boleto! Essa é a lista do que nós mesmos vamos comprar pra nossa casa, guardada aqui pra nada
            se perder e tudo ficar organizado.
          </p>
          <p className={styles.lede}>
            Ninguém precisa dar nada. Mas, como muita gente se ofereceu: se bater a vontade de ajudar, com qualquer
            valor, fique à vontade e fale com a gente. Sem pedido e sem cobrança, tá?
          </p>
          {goal && goal.target > 0 && (
            <div className={styles.goal}>
              <ProgressBar
                label="Meta da entrada da casa própria"
                value={Math.min(goal.saved, goal.target)}
                max={goal.target}
                hasValueLabel
              />
              <p className={styles.goalText}>
                {goal.saved >= goal.target
                  ? `Entrada garantida: ${formatBRL(goal.target)}!`
                  : `Faltam ${formatBRL(goal.target - goal.saved)} de ${formatBRL(goal.target)}`}
                {!!goal.price && <><br />Imóvel de até {formatBRL(goal.price)}</>}
              </p>
            </div>
          )}
          <div className={styles.cta}>
            <Button label="Espiar a lista" variant="primary" size="lg" href="#ambientes" />
          </div>
        </div>
      </div>
    </section>
  );
}
