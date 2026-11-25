"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Selector } from "@astryxdesign/core/Selector";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TIERS, type Delivery, type Gift } from "@/data/gifts";
import { HOLD_HOURS, formatBRL, giverLabel, isSoldOut, unitsLabel, unitsLeft } from "@/lib/catalog";
import { reserveGift } from "@/lib/firebase";
import { useIsNarrow } from "@/lib/hooks";
import { CopyButton } from "./CopyButton";
import { Gallery } from "./Gallery";
import { DeliveryNote, ModelBox, StoreLinks, VoltageNote } from "./GiftInfo";
import styles from "./GiftDialog.module.css";

type Step = { kind: "details" } | { kind: "reserve" } | { kind: "done"; guest: string; units: number; until: Date; link: string };
type Errors = Partial<Record<"name" | "email" | "tier" | "form" | "race", string>>;

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

interface Props {
  gift: Gift | null;
  delivery: Delivery | null;
  onClose: () => void;
  /** After a reservation (or a lost race), so the list reloads. */
  onChanged: () => void;
}

/** Details, then the reservation form in the same dialog, then the confirmation with the personal link. */
export function GiftDialog({ gift, delivery, onClose, onChanged }: Props) {
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
      {gift && <Content key={gift.id} gift={gift} delivery={delivery} onClose={onClose} onChanged={onChanged} />}
    </Dialog>
  );
}

function Content({ gift, delivery, onClose, onChanged }: Omit<Props, "gift"> & { gift: Gift }) {
  const [step, setStep] = useState<Step>({ kind: "details" });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [tier, setTier] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const soldOut = isSoldOut(gift);
  const left = unitsLeft(gift);
  const [picked, setPicked] = useState(1);
  // After the list refreshes, fewer units may be left than the guest had picked.
  const units = Math.min(picked, Math.max(1, left));
  const giver = giverLabel(gift);

  // The reserve button that had focus is gone; put the guest straight into the name field.
  useEffect(() => {
    if (step.kind === "reserve") formRef.current?.querySelector("input")?.focus();
  }, [step.kind]);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const guest = name.trim();
    const next: Errors = {};
    if (!guest) next.name = "Informe seu nome para reservar.";
    else if (guest.length > 60) next.name = "Use até 60 caracteres.";
    if (!EMAIL.test(email.trim())) next.email = "Informe um e-mail válido. É para lá que vai o seu link.";
    if (!tier) next.tier = "Escolha uma opção.";
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      const token = await reserveGift(gift.id, { name: guest, email, tier: tier!, units });
      setStep({
        kind: "done",
        guest,
        units,
        until: new Date(Date.now() + HOLD_HOURS * 3600_000),
        link: `${window.location.origin}/reserva?t=${token}`,
      });
    } catch (err) {
      // The form is validated above, so a refusal by the rules means someone else got there first.
      const denied = (err as { code?: string }).code === "permission-denied";
      setErrors({
        form: denied
          ? gift.quantity > 1
            ? "Outro convidado acabou de reservar unidades deste presente. A lista foi atualizada; confira quantas faltam."
            : "Alguém acabou de reservar este presente. A lista foi atualizada."
          : "Não conseguimos reservar agora. Confira sua conexão e tente de novo.",
        // Remembers how many were left when refused; once the refreshed gift shows a new count, the guest can retry.
        race: denied ? String(left) : undefined,
      });
    } finally {
      setBusy(false);
      onChanged();
    }
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
        subtitle={step.kind === "done" ? gift.name : formatBRL(gift.price)}
        onOpenChange={(open) => !open && onClose()}
        startContent={back}
      />
      <div className={styles.body}>
        {step.kind === "details" && (
          <div className={styles.details}>
            <Gallery photos={gift.photos} name={gift.name} />
            <div className={styles.info}>
              <p className={styles.price}>
                {formatBRL(gift.price)}
                {gift.quantity > 1 && <span className={styles.each}> cada</span>}
              </p>
              {unitsLabel(gift) && <p className={styles.units}>{unitsLabel(gift)}</p>}
              <p className={styles.note}>Preço de referência. Confira o valor e o estoque na loja.</p>
              {gift.description && <p className={styles.description}>{gift.description}</p>}
              <ModelBox gift={gift} />
              <VoltageNote gift={gift} />
              {(gift.brand || gift.dims || gift.variants) && (
                <dl className={styles.spec}>
                  {gift.brand && (<><dt>Marca</dt><dd>{gift.brand}</dd></>)}
                  {gift.dims && (<><dt>Medidas</dt><dd>{gift.dims}</dd></>)}
                  {gift.variants && (<><dt>Variantes</dt><dd>{gift.variants.join(", ")}</dd></>)}
                </dl>
              )}
              <StoreLinks gift={gift} />
              {gift.status === "bought" ? (
                <p className={styles.reserved}>Este presente já foi dado{giver ? ` (${giver})` : ""}. Obrigado!</p>
              ) : soldOut ? (
                <p className={styles.reserved}>
                  {gift.quantity > 1 ? "Todas as unidades já foram reservadas" : "Outro convidado reservou este presente"}. Se uma
                  compra não for confirmada em até {HOLD_HOURS} horas, ela volta para a lista.
                </p>
              ) : giver && gift.quantity > 1 ? (
                <p className={styles.reserved}>{giver}. Ainda dá para dar {left === 1 ? "1 unidade" : `${left} unidades`}.</p>
              ) : null}
              <div className={styles.actions}>
                <Button
                  label={soldOut ? "Esgotado" : "Reservar presente"}
                  variant="primary"
                  size="lg"
                  isDisabled={soldOut}
                  onClick={() => setStep({ kind: "reserve" })}
                />
              </div>
              <DeliveryNote delivery={delivery} />
            </div>
          </div>
        )}

        {step.kind === "reserve" && (
          <form ref={formRef} className={styles.form} onSubmit={submit} noValidate>
            <p className={styles.lead}>
              O presente fica reservado para você por {HOLD_HOURS} horas, tempo para comprar na loja e marcar
              <strong> Já comprei</strong> pelo link que enviamos para o seu e-mail.
            </p>
            {left > 1 && (
              <Selector
                label="Quantas unidades você vai dar?"
                size="lg"
                options={Array.from({ length: left }, (_, i) => ({
                  value: String(i + 1),
                  label: `${i + 1} ${i === 0 ? "unidade" : "unidades"} · ${formatBRL(gift.price * (i + 1))}`,
                }))}
                value={String(units)}
                onChange={(v) => setPicked(Number(v))}
              />
            )}
            <TextInput
              label="Seu nome"
              value={name}
              onChange={(v) => {
                setName(v);
                if (errors.name) setErrors({ ...errors, name: undefined });
              }}
              isRequired
              size="lg"
              autoComplete="name"
              status={errors.name ? { type: "error", message: errors.name } : undefined}
            />
            <TextInput
              label="Seu e-mail"
              type="email"
              value={email}
              onChange={(v) => {
                setEmail(v);
                if (errors.email) setErrors({ ...errors, email: undefined });
              }}
              isRequired
              size="lg"
              autoComplete="email"
              status={errors.email ? { type: "error", message: errors.email } : undefined}
            />
            <Selector
              label="Você é..."
              size="lg"
              placeholder="Escolha"
              options={TIERS.map((t) => ({ value: t, label: t }))}
              value={tier ?? undefined}
              onChange={(v) => {
                setTier(v);
                if (errors.tier) setErrors({ ...errors, tier: undefined });
              }}
              status={errors.tier ? { type: "error", message: errors.tier } : undefined}
            />
            <p className={styles.note}>
              Seu primeiro nome e o parentesco aparecem na lista para os outros convidados, como “Presente de{" "}
              {name.trim() ? name.trim().split(/\s+/)[0] : "Maria"}
              {tier ? ` · ${tier}` : " · Prima"}”.
            </p>
            {errors.form && <p className={styles.reserved} role="alert">{errors.form}</p>}
            <div className={styles.actions}>
              <Button label="Confirmar reserva" variant="primary" size="lg" type="submit" isLoading={busy} isDisabled={errors.race === String(left)} />
              <Button label="Voltar aos detalhes" variant="ghost" size="lg" onClick={() => setStep({ kind: "details" })} />
            </div>
          </form>
        )}

        {step.kind === "done" && (
          <div className={styles.done}>
            <p className={styles.lead}>
              {step.units > 1 ? `${step.units} unidades estão reservadas` : "Está reservado"} para <strong>{step.guest}</strong> até{" "}
              {fmt(step.until)}. Compre na loja e depois volte pelo
              seu link para marcar <strong>Já comprei</strong> ou desistir do presente.
            </p>
            <div className={styles.linkBox}>
              <span className={styles.linkLabel}>Seu link pessoal</span>
              <code className={styles.link}>{step.link}</code>
              <CopyButton text={step.link} label="Copiar link" copiedLabel="Link copiado" />
            </div>
            <p className={styles.note}>Enviamos este link para o seu e-mail em alguns minutos. Guarde-o: é só com ele que você confirma a compra.</p>
            <ModelBox gift={gift} />
            <VoltageNote gift={gift} />
            <StoreLinks gift={gift} />
            <DeliveryNote delivery={delivery} />
            <div className={styles.actions}>
              <Button label="Voltar à lista" variant="ghost" size="lg" onClick={onClose} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export const fmt = (d: Date) =>
  d.toLocaleString("pt-BR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
