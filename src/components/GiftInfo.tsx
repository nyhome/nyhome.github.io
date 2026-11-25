"use client";

import { Button } from "@astryxdesign/core/Button";
import type { Delivery, Gift } from "@/data/gifts";
import { CopyButton } from "./CopyButton";
import styles from "./GiftInfo.module.css";

/** The exact model, copyable, with a heads-up about stores suggesting look-alikes. */
export function ModelBox({ gift }: { gift: Gift }) {
  if (!gift.model) return null;
  return (
    <div className={styles.box}>
      <span className={styles.label}>Modelo completo</span>
      <div className={styles.row}>
        <code className={styles.model}>{gift.model}</code>
        <CopyButton text={gift.model} label="Copiar modelo" />
      </div>
      <p className={styles.hint}>
        Ao buscar pelo modelo, confira se é exatamente este. Às vezes a loja sugere produtos parecidos.
      </p>
    </div>
  );
}

/** Voltage up front, so nobody buys the 220V one for a 127V house (or the other way round). */
export function VoltageNote({ gift }: { gift: Gift }) {
  if (!gift.voltage) return null;
  return (
    <p className={styles.voltage}>
      <strong>Voltagem: {gift.voltage}</strong>
      {gift.voltage === "Bivolt"
        ? " (funciona em 127V e 220V)."
        : ". Na loja, confira se escolheu essa voltagem: na errada o aparelho pode queimar."}
    </p>
  );
}

/** One row per store: its link and, when there is one, a copyable coupon. */
export function StoreLinks({ gift }: { gift: Gift }) {
  if (gift.links.length === 0) return null;
  return (
    <div className={styles.stores}>
      <span className={styles.label}>Onde comprar</span>
      <ul className={styles.storeList}>
        {gift.links.map((l, i) => (
          <li key={l.url + i} className={styles.store}>
            <span className={styles.storeName}>{l.store}</span>
            {l.coupon && (
              <span className={styles.coupon}>
                Cupom <code>{l.coupon}</code>
                <CopyButton text={l.coupon} label="Copiar cupom" variant="ghost" />
              </span>
            )}
            <Button label={`Ver na loja: ${l.store}`} variant="secondary" size="sm" href={l.url} target="_blank" rel="noopener noreferrer">
              Ver na loja
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "Como enviar o presente": take it in person, or ship it to the couple with the right recipient name. */
export function DeliveryNote({ delivery }: { delivery: Delivery | null }) {
  if (!delivery?.address) return null;
  const full = `${delivery.recipient}\n${delivery.address}`;
  return (
    <section className={styles.delivery} aria-labelledby="como-enviar">
      <h4 id="como-enviar" className={styles.deliveryTitle}>
        Como enviar o presente
      </h4>
      <p>
        Você pode receber em casa e nos entregar pessoalmente, ou mandar direto para o nosso endereço. Se for enviar,
        coloque o destinatário como <strong>{delivery.recipient}</strong>, para a entrega chegar certinho.
      </p>
      <address className={styles.address}>
        <strong>{delivery.recipient}</strong>
        <br />
        {delivery.address}
      </address>
      <div>
        <CopyButton text={full} label="Copiar endereço" copiedLabel="Endereço copiado" />
      </div>
    </section>
  );
}
