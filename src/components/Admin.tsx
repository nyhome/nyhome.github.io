"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { Button } from "@astryxdesign/core/Button";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Selector } from "@astryxdesign/core/Selector";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { ROOMS, TIERS, type Delivery, type Gift } from "@/data/gifts";
import {
  boughtByUs, deleteGift, fetchAll, logOut, markBought, publish, releaseHold, saveDelivery, setTier, signIn, undoPurchases,
  watchUser, type AdminData,
} from "@/lib/admin";
import { formatBRL, holdEndsAt, unitsLeft } from "@/lib/catalog";
import { ADMIN_UIDS, fetchDelivery, type Reservation } from "@/lib/firebase";
import { GiftForm } from "./GiftForm";
import { hide } from "@/lib/hooks";
import styles from "./Admin.module.css";

type Filter = "todos" | "draft" | "open" | "reserved" | "bought";

// A gift can be in more than one: partly bought, partly held, and still open.
const FILTERS: Record<Exclude<Filter, "todos">, (g: Gift) => boolean> = {
  draft: (g) => g.status === "draft",
  open: (g) => g.status === "available" && unitsLeft(g) > 0,
  reserved: (g) => Object.keys(g.holds).length > 0,
  bought: (g) => g.boughtUnits > 0,
};

export function Admin() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => watchUser(setUser), []);

  if (user === undefined) return <main className={styles.page}>Carregando…</main>;
  if (!user)
    return (
      <main className={styles.page}>
        <h1 className={styles.title}>Painel</h1>
        <div>
          <Button label="Entrar com Google" variant="primary" size="lg" onClick={() => signIn().catch(() => {})} />
        </div>
      </main>
    );
  if (!ADMIN_UIDS.includes(user.uid))
    return (
      <main className={styles.page}>
        <h1 className={styles.title}>Esta conta não tem acesso</h1>
        <p>
          Se você é um dos noivos, envie este código para liberar o acesso: <code className={styles.uid}>{user.uid}</code>
        </p>
        <div>
          <Button label="Sair" variant="secondary" onClick={() => logOut()} />
        </div>
      </main>
    );
  return <Panel user={user} />;
}

function Panel({ user }: { user: User }) {
  const [tab, setTab] = useState("presentes");
  return (
    <main className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>Painel</h1>
        <span className={styles.who}>
          {user.email} · <button type="button" className={styles.link} onClick={() => logOut()}>sair</button>
        </span>
      </header>
      <TabList value={tab} onChange={setTab}>
        <Tab value="presentes" label="Presentes" />
        <Tab value="entrega" label="Entrega" />
      </TabList>
      {tab === "presentes" ? <Gifts /> : <DeliveryForm />}
    </main>
  );
}

function Gifts() {
  const [data, setData] = useState<AdminData | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<Filter>("todos");
  const [editing, setEditing] = useState<Gift | "new" | null>(null);
  const [deleting, setDeleting] = useState<Gift | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [now, setNow] = useState(0);

  const load = useCallback(
    () =>
      fetchAll()
        .then((d) => {
          setData(d);
          setNow(Date.now());
          setFailed(false);
        })
        .catch(() => setFailed(true)),
    [],
  );
  useEffect(() => {
    load();
  }, [load]);

  const run = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id);
    try {
      await fn();
    } catch {
      setFailed(true);
    } finally {
      await load();
      setBusy(null);
    }
  };

  if (!data) return <p>{failed ? "Não deu para carregar. Recarregue a página." : "Carregando presentes…"}</p>;

  const shown = data.gifts.filter((g) => filter === "todos" || FILTERS[filter](g));
  const count = (f: Exclude<Filter, "todos">) => data.gifts.filter(FILTERS[f]).length;

  return (
    <section className={styles.section}>
      <div className={styles.toolbar}>
        <SegmentedControl label="Status" value={filter} onChange={(v) => setFilter(v as Filter)} size="sm">
          <SegmentedControlItem value="todos" label={`Todos (${data.gifts.length})`} />
          <SegmentedControlItem value="draft" label={`Rascunho (${count("draft")})`} />
          <SegmentedControlItem value="open" label={`Disponível (${count("open")})`} />
          <SegmentedControlItem value="reserved" label={`Reservado (${count("reserved")})`} />
          <SegmentedControlItem value="bought" label={`Comprado (${count("bought")})`} />
        </SegmentedControl>
        <Button label="Adicionar presente" variant="primary" onClick={() => setEditing("new")} />
      </div>
      {failed && <p className={styles.error} role="alert">Uma ação falhou. A lista foi recarregada; tente de novo.</p>}

      {ROOMS.map((room) => {
        const list = shown.filter((g) => g.room === room.id);
        if (!list.length) return null;
        return (
          <div key={room.id} className={styles.group}>
            <h2 className={styles.groupName}>{room.name}</h2>
            <ul className={styles.rows}>
              {list.map((g) => (
                <Row
                  key={g.id}
                  gift={g}
                  reservations={data.active[g.id] ?? []}
                  now={now}
                  busy={busy === g.id}
                  onAction={(fn) => run(g.id, fn)}
                  onEdit={() => setEditing(g)}
                  onDelete={() => setDeleting(g)}
                />
              ))}
            </ul>
          </div>
        );
      })}
      {shown.length === 0 && <p className={styles.muted}>Nenhum presente aqui.</p>}

      <GiftForm target={editing} onClose={() => setEditing(null)} onSaved={load} />
      <AlertDialog
        isOpen={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Excluir “${deleting?.name ?? ""}”?`}
        description="O presente some da lista. Não dá para desfazer."
        cancelLabel="Cancelar"
        actionLabel="Excluir"
        actionVariant="destructive"
        onAction={async () => {
          const g = deleting!;
          setDeleting(null);
          await run(g.id, () => deleteGift(g.id));
        }}
      />
    </section>
  );
}

const when = (ms: number) => new Date(ms).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

function Row({
  gift: g, reservations, now, busy, onAction, onEdit, onDelete,
}: {
  gift: Gift;
  reservations: Reservation[];
  now: number;
  busy: boolean;
  onAction: (fn: () => Promise<unknown>) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const left = unitsLeft(g);
  const multi = g.quantity > 1;
  const status =
    g.status === "draft" ? "Rascunho"
    : g.status === "bought" ? (g.givers.every((x) => x.byCouple) ? "Comprado por nós" : "Comprado")
    : reservations.length && !left ? "Reservado"
    : "Disponível";
  const units = multi
    ? `${g.boughtUnits} de ${g.quantity} compradas${g.heldUnits ? ` · ${g.heldUnits} ${g.heldUnits === 1 ? "reservada" : "reservadas"}` : ""}`
    : null;

  return (
    <li className={styles.row} aria-busy={busy}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {g.photos[0] ? <img src={g.photos[0]} alt="" referrerPolicy="no-referrer" className={styles.thumb} onError={hide} /> : <span className={styles.thumb} />}
      <div className={styles.rowMain}>
        <strong>{g.name}</strong>
        <span className={styles.muted}>
          {formatBRL(g.price)}{multi && " cada"} · <span data-status={status === "Comprado por nós" ? "couple" : g.status}>{status}</span>
          {units && ` · ${units}`}
        </span>
        {g.givers.length > 0 && (
          <span className={styles.muted}>
            Deram: {g.givers.map((x) => (x.byCouple ? "nós" : `${x.name} (${x.tier})`) + (multi ? ` ×${x.units}` : "")).join(", ")}
          </span>
        )}
        {reservations.map((r) => {
          const ends = holdEndsAt(r.reservedAt);
          return (
            <div key={r.token} className={styles.resRow}>
              <span className={styles.muted}>
                Reserva: {r.name} · {r.email}{multi && ` · ${r.units} un.`} · {when(r.reservedAt)}
                {ends < now ? " · expirada" : ` · até ${when(ends)}`}
              </span>
              <span className={styles.resActions}>
                <Button label="Marcar comprado" variant="primary" size="sm" isDisabled={busy} onClick={() => onAction(() => markBought(g, r))} />
                <Button label="Liberar" variant="secondary" size="sm" isDisabled={busy} onClick={() => onAction(() => releaseHold(g, r))} />
                <span className={styles.tier}>
                  <Selector
                    label={`Corrigir parentesco de ${r.name}`}
                    isLabelHidden
                    size="sm"
                    options={TIERS.map((t) => ({ value: t, label: t }))}
                    value={g.holds[r.holdId]?.giverTier ?? r.tier}
                    onChange={(t) => onAction(() => setTier(g, r, t))}
                  />
                </span>
              </span>
            </div>
          );
        })}
      </div>
      <div className={styles.rowActions}>
        {g.status === "draft" && <Button label="Publicar" variant="primary" size="sm" isDisabled={busy} onClick={() => onAction(() => publish(g.id))} />}
        {g.status !== "draft" && left > 0 && (
          <Button
            label={multi ? `Compramos as ${left === 1 ? "1 restante" : `${left} restantes`}` : "Comprado por nós"}
            variant="secondary"
            size="sm"
            isDisabled={busy}
            onClick={() => onAction(() => boughtByUs(g))}
          />
        )}
        {g.boughtUnits > 0 && (
          <Button label="Desfazer compras" variant="secondary" size="sm" isDisabled={busy} onClick={() => onAction(() => undoPurchases(g))} />
        )}
        <Button label="Editar" variant="ghost" size="sm" isDisabled={busy} onClick={onEdit} />
        <Button label="Excluir" variant="ghost" size="sm" isDisabled={busy} onClick={onDelete} />
      </div>
    </li>
  );
}

function DeliveryForm() {
  const [form, setForm] = useState<Delivery | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  useEffect(() => {
    fetchDelivery()
      .then((d) => setForm(d ?? { recipient: "", address: "" }))
      .catch(() => setState("error"));
  }, []);
  if (!form) return <p>{state === "error" ? "Não deu para carregar." : "Carregando…"}</p>;

  return (
    <form
      className={styles.form}
      onSubmit={async (e) => {
        e.preventDefault();
        setState("saving");
        try {
          await saveDelivery({ recipient: form.recipient.trim(), address: form.address.trim() });
          setState("saved");
        } catch {
          setState("error");
        }
      }}
    >
      <p className={styles.muted}>Aparece no bloco “Como enviar o presente” do site e nos e-mails, com botão de copiar.</p>
      <TextInput label="Nome do destinatário" value={form.recipient} onChange={(v) => setForm({ ...form, recipient: v })} isRequired />
      <TextArea label="Endereço completo" description="Rua, número, complemento, bairro, cidade, UF e CEP." value={form.address} rows={4} onChange={(v) => setForm({ ...form, address: v })} isRequired />
      <div className={styles.actions}>
        <Button label="Salvar" variant="primary" type="submit" isLoading={state === "saving"} />
        {state === "saved" && <span className={styles.muted}>Salvo.</span>}
        {state === "error" && <span className={styles.error}>Não deu para salvar.</span>}
      </div>
    </form>
  );
}
