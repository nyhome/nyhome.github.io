"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { Button } from "@astryxdesign/core/Button";
import type { Delivery, Gift } from "@/data/gifts";
import { HOLD_HOURS } from "@/lib/catalog";
import { closeReservation, fetchDelivery, fetchReservation, holdsGift, type Reservation as Res } from "@/lib/firebase";
import { fmt } from "./GiftDialog";
import { DeliveryNote, ModelBox, StoreLinks, VoltageNote } from "./GiftInfo";
import styles from "./Reservation.module.css";

type State =
  | { kind: "loading" }
  | { kind: "invalid" }
  | { kind: "error" }
  | { kind: "ready"; reservation: Res; gift: Gift | null; delivery: Delivery | null; now: number };

/** The guest's personal link (/reserva?t=TOKEN): confirm the purchase or give the gift up. */
export function Reservation() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [busy, setBusy] = useState<"bought" | "released" | null>(null);
  const [askRelease, setAskRelease] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = () => {
    // Read here, not with useSearchParams, so the page prerenders without a Suspense boundary.
    const token = new URLSearchParams(window.location.search).get("t");
    return Promise.all([token ? fetchReservation(token) : null, fetchDelivery()])
      .then(([found, delivery]) => setState(found ? { kind: "ready", ...found, delivery, now: Date.now() } : { kind: "invalid" }))
      .catch(() => setState({ kind: "error" }));
  };

  useEffect(() => {
    load();
  }, []);

  const act = async (outcome: "bought" | "released") => {
    if (state.kind !== "ready") return;
    setBusy(outcome);
    setFailed(false);
    try {
      await closeReservation(state.reservation, outcome);
      await load();
    } catch {
      setFailed(true);
      await load();
    } finally {
      setBusy(null);
      setAskRelease(false);
    }
  };

  return (
    <main className={styles.page}>
      <Link href="/" className={styles.home}>
        Casa N&amp;Y · Lista de presentes
      </Link>
      {state.kind === "loading" && <p>Carregando sua reserva…</p>}
      {state.kind === "invalid" && (
        <Message title="Link inválido">
          Não encontramos uma reserva com este link. Confira se copiou o link inteiro do e-mail.
        </Message>
      )}
      {state.kind === "error" && (
        <Message title="Não conseguimos carregar">
          Confira sua conexão e <button type="button" className={styles.inline} onClick={load}>tente de novo</button>.
        </Message>
      )}
      {state.kind === "ready" && <Ready {...state} busy={busy} failed={failed} onBought={() => act("bought")} onRelease={() => setAskRelease(true)} />}

      <AlertDialog
        isOpen={askRelease}
        onOpenChange={setAskRelease}
        title="Desistir deste presente?"
        description="Ele volta para a lista e outra pessoa poderá reservar."
        cancelLabel="Manter reserva"
        actionLabel="Desistir"
        actionVariant="destructive"
        isActionLoading={busy === "released"}
        onAction={() => act("released")}
      />
    </main>
  );
}

function Ready({
  reservation: r, gift, delivery, now, busy, failed, onBought, onRelease,
}: Extract<State, { kind: "ready" }> & { busy: string | null; failed: boolean; onBought: () => void; onRelease: () => void }) {
  const first = r.name.split(/\s+/)[0];
  const name = gift?.name ?? "o presente";
  // "2 unidades de Jogo de lençol" when the guest is giving more than one.
  const what = r.units > 1 ? `${r.units} unidades de ${name}` : name;

  if (r.status === "bought")
    return <Message title={`Obrigado, ${first}!`}>Você confirmou a compra de <strong>{what}</strong>. A gente vai amar.</Message>;
  if (r.status === "released")
    return <Message title="Reserva desfeita">Você desistiu de <strong>{what}</strong> e {r.units > 1 ? "elas voltaram" : "ele voltou"} para a lista.</Message>;
  if (r.status === "expired" || !holdsGift(r, gift))
    return (
      <Message title="Sua reserva expirou">
        O prazo de {HOLD_HOURS} horas acabou e <strong>{what}</strong> {r.units > 1 ? "voltaram" : "voltou"} para a lista. Se ainda quiser dar este presente,
        veja se ele continua disponível.
      </Message>
    );

  const ends = new Date(r.reservedAt + HOLD_HOURS * 3600_000);
  const late = ends.getTime() < now;
  return (
    <div className={styles.ready}>
      <h1 className={styles.title}>{name}</h1>
      {r.units > 1 && <p className={styles.lead}>Você está dando <strong>{r.units} unidades</strong>.</p>}
      <p className={styles.lead}>
        {late
          ? `${first}, o prazo da sua reserva acabou, mas o presente ainda está com você. Se já comprou, confirme agora.`
          : `${first}, este presente está reservado para você até ${fmt(ends)}. Depois de comprar na loja, volte aqui e confirme.`}
      </p>
      {failed && <p className={styles.alert} role="alert">Não deu certo agora. Atualizamos a página; tente de novo.</p>}
      <div className={styles.actions}>
        <Button label="Já comprei" variant="primary" size="lg" isLoading={busy === "bought"} onClick={onBought} />
        <Button label="Desistir" variant="ghost" size="lg" isDisabled={busy !== null} onClick={onRelease} />
      </div>
      {gift && <ModelBox gift={gift} />}
      {gift && <VoltageNote gift={gift} />}
      {gift && <StoreLinks gift={gift} />}
      <DeliveryNote delivery={delivery} />
    </div>
  );
}

function Message({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.ready}>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.lead}>{children}</p>
      <div>
        <Button label="Ver a lista de presentes" variant="secondary" size="lg" href="/" />
      </div>
    </div>
  );
}
