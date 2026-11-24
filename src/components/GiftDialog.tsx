"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { TextInput } from "@astryxdesign/core/TextInput";
import type { Gift } from "@/data/gifts";
import { formatBRL } from "@/lib/catalog";
import { useIsNarrow } from "@/lib/hooks";
import { Gallery } from "./Gallery";
import styles from "./GiftDialog.module.css";

const HOURS = 72;

type Step = { kind: "details" } | { kind: "reserve" } | { kind: "done"; guest: string; until: Date; link: string };

interface Props {
  gift: Gift | null;
  onClose: () => void;
  onReserve: (gift: Gift) => void;
}

/** Details, then the reservation form in the same dialog, then the confirmation with the personal link. */
export function GiftDialog({ gift, onClose, onReserve }: Props) {
  const narrow = useIsNarrow();
  return (
    <Dialog
      isOpen={gift !== null}
      onOpenChange={(open) => !open && onClose()}
      width={narrow ? "100%" : 980}
      maxHeight="92dvh"
      variant={narrow ? "fullscreen" : "standard"}
      purpose="form"
    >
      {/* Keyed by gift so each opening starts on the details step with an empty form. */}
      {gift && <Content key={gift.id} gift={gift} onClose={onClose} onReserve={onReserve} />}
    </Dialog>
  );
}

function Content({ gift, onClose, onReserve }: { gift: Gift; onClose: () => void; onReserve: (gift: Gift) => void }) {
  const [step, setStep] = useState<Step>({ kind: "details" });
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // The reserve button that had focus is gone; put the guest straight into the name field.
  useEffect(() => {
    if (step.kind === "reserve") formRef.current?.querySelector("input")?.focus();
  }, [step.kind]);

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const guest = name.trim();
    if (!guest) {
      setError("Informe seu nome para reservar.");
      return;
    }
    // shortcut: the preview reserves in memory; the real flow is an atomic insert in Supabase with a server-made token
    const token = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
    onReserve(gift);
    setStep({ kind: "done", guest, until: new Date(Date.now() + HOURS * 3600_000), link: `${window.location.origin}/reserva/${token}` });
  };

  const back =
    step.kind === "reserve" ? (
      <Button label="Voltar aos detalhes" variant="ghost" size="sm" onClick={() => setStep({ kind: "details" })}>
        Voltar
      </Button>
    ) : undefined;

  return (
    <>
      <DialogHeader
        title={step.kind === "done" ? "Presente reservado" : gift.name}
        subtitle={step.kind === "done" ? gift.name : `${gift.store}, ${formatBRL(gift.price)}`}
        onOpenChange={(open) => !open && onClose()}
        startContent={back}
      />
      <div className={styles.body}>
        {step.kind === "details" && (
          <div className={styles.details}>
            <Gallery photos={gift.photos} name={gift.name} />
            <div className={styles.info}>
              <p className={styles.price}>{formatBRL(gift.price)}</p>
              <p className={styles.note}>Preço de referência. Confira o valor e o estoque na loja.</p>
              {gift.description && <p className={styles.description}>{gift.description}</p>}
              <dl className={styles.spec}>
                {gift.brand && (<><dt>Marca</dt><dd>{gift.brand}</dd></>)}
                {gift.model && (<><dt>Modelo</dt><dd>{gift.model}</dd></>)}
                {gift.dims && (<><dt>Medidas</dt><dd>{gift.dims}</dd></>)}
                {gift.variants && (<><dt>Variantes</dt><dd>{gift.variants.join(", ")}</dd></>)}
                <dt>Loja</dt>
                <dd>{gift.store}</dd>
              </dl>
              {gift.status === "reserved" ? (
                <p className={styles.reserved}>
                  Outro convidado reservou este presente. Ele volta para a lista se a compra não for confirmada em {HOURS} horas.
                </p>
              ) : null}
              <div className={styles.actions}>
                <Button
                  label="Reservar presente"
                  variant="primary"
                  size="lg"
                  isDisabled={gift.status !== "available"}
                  onClick={() => setStep({ kind: "reserve" })}
                />
                <Button label="Ver na loja" variant="secondary" size="lg" href={gift.url} target="_blank" rel="noopener noreferrer" />
              </div>
            </div>
          </div>
        )}

        {step.kind === "reserve" && (
          <form ref={formRef} className={styles.form} onSubmit={submit} noValidate>
            <p className={styles.lead}>
              Informe seu nome. O presente fica reservado para você por {HOURS} horas, tempo para comprar na loja e marcar
              <strong> Já comprei</strong>.
            </p>
            <TextInput
              label="Seu nome"
              value={name}
              onChange={(v) => {
                setName(v);
                if (error) setError(null);
              }}
              isRequired
              size="lg"
              status={error ? { type: "error", message: error } : undefined}
            />
            <div className={styles.actions}>
              <Button label="Confirmar reserva" variant="primary" size="lg" type="submit" />
              <Button label="Voltar aos detalhes" variant="ghost" size="lg" onClick={() => setStep({ kind: "details" })} />
            </div>
          </form>
        )}

        {step.kind === "done" && (
          <div className={styles.done}>
            <p className={styles.lead}>
              Está reservado para <strong>{step.guest}</strong> até{" "}
              {step.until.toLocaleString("pt-BR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}.
              Compre na loja e depois volte pelo seu link para marcar <strong>Já comprei</strong> ou liberar o presente.
            </p>
            <div className={styles.linkBox}>
              <span className={styles.linkLabel}>Seu link pessoal</span>
              <code className={styles.link}>{step.link}</code>
              <Button
                label={copied ? "Link copiado" : "Copiar link"}
                variant="secondary"
                size="sm"
                onClick={async () => {
                  await navigator.clipboard.writeText(step.link);
                  setCopied(true);
                }}
              />
            </div>
            <p className={styles.note}>Prévia: o link pessoal passa a funcionar quando as reservas forem salvas no banco.</p>
            <div className={styles.actions}>
              <Button label="Ir para a loja" variant="primary" size="lg" href={gift.url} target="_blank" rel="noopener noreferrer" />
              <Button label="Voltar à lista" variant="ghost" size="lg" onClick={onClose} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
