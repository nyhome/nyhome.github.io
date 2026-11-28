"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { GOAL_PRICE, GOAL_TARGET, OPENING_PHOTO, type Goal } from "@/data/gifts";
import { formatBRL, formatBRLShort } from "@/lib/catalog";
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
          <p className={styles.kicker}>
            Chá de casa <s>nova</s> própria
          </p>
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
          {goal && goal.target > 0 && <GoalRuler goal={goal} />}
          <div className={styles.cta}>
            <Button label="Espiar a lista" variant="primary" size="lg" href="#ambientes" />
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * The down payment as a stretch of the place's price, drawn like the dimension line on the gift cards. Without a
 * price the line is just the down payment.
 */
function GoalRuler({ goal }: { goal: Goal }) {
  const { target, saved } = goal;
  const whole = Math.max(goal.price || 0, target);
  const pct = (v: number) => `${(Math.min(v, whole) / whole) * 100}%`;
  const done = saved >= target;
  return (
    <div
      className={styles.ruler}
      style={{ "--entrada": pct(target), "--fill": pct(Math.min(saved, target)) } as React.CSSProperties}
      role="img"
      aria-label={`Juntamos ${formatBRL(saved)} de ${formatBRL(target)} de entrada${goal.price ? `, num imóvel de até ${formatBRL(goal.price)}` : ""}`}
    >
      <div className={styles.line}>
        <span className={styles.entrada} />
        <span className={styles.fill} />
        {saved > 0 && <span className={styles.marker}>{formatBRLShort(saved)}</span>}
      </div>
      <div className={styles.labels} aria-hidden>
        <span>R$ 0</span>
        <span className={styles.entradaLabel} data-end={whole === target || undefined}>
          entrada
          <br />
          {formatBRLShort(target)}
        </span>
        {whole > target && (
          <span className={styles.priceLabel}>
            imóvel
            <br />
            até {formatBRLShort(whole)}
          </span>
        )}
      </div>
      <p className={styles.say}>{done ? `Entrada garantida: ${formatBRL(target)}!` : `Faltam ${formatBRL(target - saved)} pra entrada.`}</p>
    </div>
  );
}
