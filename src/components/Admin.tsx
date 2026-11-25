"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  boughtByUs, deleteGift, enqueueImports, fetchAll, fetchImports, findUrls, logOut, markBought, publish, release, saveDelivery,
  setTier, signIn, watchUser, type AdminData, type ImportJob,
} from "@/lib/admin";
import { formatBRL, holdEnds } from "@/lib/catalog";
import { ADMIN_UIDS, fetchDelivery, type Reservation } from "@/lib/firebase";
import { GiftForm } from "./GiftForm";
import { hide } from "@/lib/hooks";
import styles from "./Admin.module.css";

type Filter = "todos" | Gift["status"];

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
  // /admin?importar=<link or shared text>: the iPhone share-sheet shortcut lands here and the link joins the queue.
  const [shared] = useState(() => (typeof window === "undefined" ? [] : findUrls(new URLSearchParams(window.location.search).get("importar") ?? "")));
  const [tab, setTab] = useState(shared.length ? "importar" : "presentes");
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
        <Tab value="importar" label="Importar" />
        <Tab value="entrega" label="Entrega" />
      </TabList>
      {tab === "presentes" ? <Gifts /> : tab === "importar" ? <Importer uid={user.uid} shared={shared} /> : <DeliveryForm />}
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

  const shown = data.gifts.filter((g) => filter === "todos" || g.status === filter);
  const count = (s: Gift["status"]) => data.gifts.filter((g) => g.status === s).length;

  return (
    <section className={styles.section}>
      <div className={styles.toolbar}>
        <SegmentedControl label="Status" value={filter} onChange={(v) => setFilter(v as Filter)} size="sm">
          <SegmentedControlItem value="todos" label={`Todos (${data.gifts.length})`} />
          <SegmentedControlItem value="draft" label={`Rascunho (${count("draft")})`} />
          <SegmentedControlItem value="available" label={`Disponível (${count("available")})`} />
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
                  res={data.current[g.id]}
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

const STATUS: Record<Gift["status"], string> = { draft: "Rascunho", available: "Disponível", reserved: "Reservado", bought: "Comprado" };

function Row({
  gift: g, res, now, busy, onAction, onEdit, onDelete,
}: {
  gift: Gift;
  now: number;
  res?: Reservation;
  busy: boolean;
  onAction: (fn: () => Promise<unknown>) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const ends = holdEnds(g);
  const expired = ends !== null && ends < now;
  const status = g.byCouple ? "Comprado por nós" : expired ? "Reserva expirada" : STATUS[g.status];

  return (
    <li className={styles.row} aria-busy={busy}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {g.photos[0] ? <img src={g.photos[0]} alt="" referrerPolicy="no-referrer" className={styles.thumb} onError={hide} /> : <span className={styles.thumb} />}
      <div className={styles.rowMain}>
        <strong>{g.name}</strong>
        <span className={styles.muted}>
          {formatBRL(g.price)} · <span data-status={g.byCouple ? "couple" : g.status}>{status}</span>
        </span>
        {res && (
          <span className={styles.muted}>
            {res.name} ({res.tier}) · {res.email} · {new Date(res.reservedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
            {ends && !expired && ` · até ${new Date(ends).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`}
          </span>
        )}
      </div>
      <div className={styles.rowActions}>
        {g.status === "draft" && <Button label="Publicar" variant="primary" size="sm" isDisabled={busy} onClick={() => onAction(() => publish(g.id))} />}
        {g.status === "reserved" && <Button label="Marcar comprado" variant="primary" size="sm" isDisabled={busy} onClick={() => onAction(() => markBought(g, res))} />}
        {(g.status === "available" || g.status === "reserved") && (
          <Button label="Comprado por nós" variant="secondary" size="sm" isDisabled={busy} onClick={() => onAction(() => boughtByUs(g, res))} />
        )}
        {(g.status === "reserved" || g.status === "bought") && (
          <Button label={g.status === "bought" ? "Desfazer compra" : "Liberar"} variant="secondary" size="sm" isDisabled={busy} onClick={() => onAction(() => release(g, res))} />
        )}
        {g.giverName && !g.byCouple && (
          <div className={styles.tier}>
            <Selector
              label="Corrigir parentesco"
              isLabelHidden
              size="sm"
              options={TIERS.map((t) => ({ value: t, label: t }))}
              value={g.giverTier ?? undefined}
              onChange={(t) => onAction(() => setTier(g, res, t))}
            />
          </div>
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

const JOB: Record<ImportJob["status"], string> = { queued: "Na fila", running: "Importando…", done: "Publicado", error: "Erro" };

function Importer({ uid, shared }: { uid: string; shared: string[] }) {
  const [text, setText] = useState("");
  const [jobs, setJobs] = useState<ImportJob[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const sent = useRef(false);

  const load = useCallback(
    () =>
      fetchImports()
        .then((j) => {
          setJobs(j);
          setNow(Date.now());
        })
        .catch(() => setNote("Não deu para carregar a fila.")),
    [],
  );

  const send = useCallback(
    async (urls: string[]) => {
      if (!urls.length) return setNote("Nenhum link encontrado. Cole links que começam com https://");
      try {
        await enqueueImports(urls, uid);
        setNote(urls.length === 1 ? "Link na fila. Em instantes ele aparece publicado na lista." : `${urls.length} links na fila.`);
        await load();
      } catch {
        setNote("Não deu para colocar na fila. Tente de novo.");
      }
    },
    [uid, load],
  );

  useEffect(() => {
    if (shared.length && !sent.current) {
      sent.current = true;
      window.history.replaceState(null, "", "/admin");
      send(shared);
    } else load();
  }, [shared, send, load]);

  // Poll while something is still being worked on.
  const active = jobs?.some((j) => j.status === "queued" || j.status === "running");
  useEffect(() => {
    if (!active) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [active, load]);

  const stuck = jobs?.some((j) => j.status === "queued" && now - j.createdAt > 3 * 60_000);

  return (
    <section className={styles.section}>
      <form
        className={styles.form}
        onSubmit={async (e) => {
          e.preventDefault();
          await send(findUrls(text));
          setText("");
        }}
      >
        <TextArea
          label="Links de produtos"
          description="Um ou mais links da Amazon, Mercado Livre, Shopee… A IA lê a página, pega nome, modelo, preço, fotos e cupom e publica na lista."
          value={text}
          onChange={setText}
          rows={4}
          placeholder="https://www.amazon.com.br/…"
        />
        <div className={styles.actions}>
          <Button label="Importar" variant="primary" type="submit" />
          {note && <span className={styles.muted}>{note}</span>}
        </div>
      </form>
      {stuck && (
        <p className={styles.error} role="alert">
          Tem link parado na fila há mais de 3 minutos: o importador no Mac (npm run importador) não está rodando.
        </p>
      )}
      {jobs && jobs.length > 0 && (
        <ul className={styles.rows}>
          {jobs.map((j) => (
            <li key={j.id} className={styles.jobRow}>
              <span data-status={j.status} className={styles.jobStatus}>{JOB[j.status]}</span>
              <span className={styles.jobMain}>
                <strong>{j.name ?? new URL(j.url).hostname.replace(/^www\./, "")}</strong>
                <span className={styles.muted}>{j.error ?? j.url}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
