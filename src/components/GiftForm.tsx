"use client";

import { useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Selector } from "@astryxdesign/core/Selector";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { ROOMS, type Gift, type GiftLink, type RoomId } from "@/data/gifts";
import { saveGift } from "@/lib/admin";
import { hide } from "@/lib/hooks";
import styles from "./Admin.module.css";

interface Props {
  /** null = closed; "new" = add; a gift = edit. */
  target: Gift | "new" | null;
  onClose: () => void;
  onSaved: () => void;
}

export function GiftForm({ target, onClose, onSaved }: Props) {
  return (
    <Dialog isOpen={target !== null} onOpenChange={(o) => !o && onClose()} width={760} maxHeight="92dvh" purpose="form">
      {target && <Form key={target === "new" ? "new" : target.id} gift={target === "new" ? null : target} onClose={onClose} onSaved={onSaved} />}
    </Dialog>
  );
}

const emptyLink = (): GiftLink => ({ store: "", url: "", coupon: "" });

function Form({ gift, onClose, onSaved }: { gift: Gift | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(gift?.name ?? "");
  const [model, setModel] = useState(gift?.model ?? "");
  const [brand, setBrand] = useState(gift?.brand ?? "");
  const [room, setRoom] = useState<RoomId | undefined>(gift?.room);
  const [price, setPrice] = useState(gift ? String(gift.price) : "");
  const [dims, setDims] = useState(gift?.dims ?? "");
  const [description, setDescription] = useState(gift?.description ?? "");
  const [photos, setPhotos] = useState<string[]>(gift?.photos.length ? gift.photos : [""]);
  const [links, setLinks] = useState<GiftLink[]>(gift?.links.length ? gift.links : [emptyLink()]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // "1.299,90" (pt-BR) or "1299.90": a comma means pt-BR, so dots are thousands separators.
    const value = Number(price.includes(",") ? price.replace(/\./g, "").replace(",", ".") : price);
    const cleanLinks = links.filter((l) => l.url.trim()).map((l) => ({ store: l.store.trim() || "Loja", url: l.url.trim(), coupon: l.coupon?.trim() }));
    if (!name.trim() || !room || !price.trim() || !Number.isFinite(value) || value < 0) {
      setError("Preencha nome, cômodo e um preço válido.");
      return;
    }
    if (cleanLinks.some((l) => !/^https?:\/\//.test(l.url))) {
      setError("Os links precisam começar com http:// ou https://.");
      return;
    }
    setBusy(true);
    try {
      await saveGift(gift?.id ?? null, {
        room, name: name.trim(), model: model.trim(), brand: brand.trim(), description: description.trim(), dims: dims.trim(),
        price: value, links: cleanLinks, photos: photos.map((p) => p.trim()).filter(Boolean),
      });
      onSaved();
      onClose();
    } catch {
      setError("Não deu para salvar. Tente de novo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DialogHeader title={gift ? "Editar presente" : "Novo presente"} subtitle={gift ? undefined : "Entra como rascunho; publique quando estiver pronto."} onOpenChange={(o) => !o && onClose()} />
      <form className={styles.form} onSubmit={submit} noValidate>
        <TextInput label="Nome no catálogo" description="Curto, como aparece no card." value={name} onChange={setName} isRequired />
        <TextInput label="Modelo completo" description="O texto exato que o convidado vai buscar na loja." value={model} onChange={setModel} />
        <div className={styles.cols}>
          <Selector label="Cômodo" placeholder="Escolha" options={ROOMS.map((r) => ({ value: r.id, label: r.name }))} value={room} onChange={(v) => setRoom(v as RoomId)} isRequired />
          <TextInput label="Preço de referência (R$)" value={price} onChange={setPrice} isRequired />
        </div>
        <div className={styles.cols}>
          <TextInput label="Marca" value={brand} onChange={setBrand} isOptional />
          <TextInput label="Medidas" value={dims} onChange={setDims} isOptional />
        </div>
        <TextArea label="Descrição" value={description} onChange={setDescription} rows={3} isOptional />

        <fieldset className={styles.fieldset}>
          <legend>Fotos (URLs)</legend>
          {photos.map((p, i) => (
            <div key={i} className={styles.photoRow}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {p ? <img src={p} alt="" referrerPolicy="no-referrer" className={styles.preview} onError={hide} /> : <span className={styles.preview} />}
              <TextInput label={`Foto ${i + 1}`} isLabelHidden type="url" placeholder="https://…" value={p} onChange={(v) => setPhotos(photos.map((x, j) => (j === i ? v : x)))} />
              <Button label={`Remover foto ${i + 1}`} variant="ghost" size="sm" onClick={() => setPhotos(photos.filter((_, j) => j !== i))}>
                Remover
              </Button>
            </div>
          ))}
          <div>
            <Button label="Adicionar foto" variant="secondary" size="sm" onClick={() => setPhotos([...photos, ""])} />
          </div>
        </fieldset>

        <fieldset className={styles.fieldset}>
          <legend>Lojas</legend>
          {links.map((l, i) => (
            <div key={i} className={styles.linkRow}>
              <TextInput label="Loja" value={l.store} placeholder="Amazon" onChange={(v) => setLinks(links.map((x, j) => (j === i ? { ...x, store: v } : x)))} />
              <TextInput label="Link" type="url" value={l.url} placeholder="https://…" onChange={(v) => setLinks(links.map((x, j) => (j === i ? { ...x, url: v } : x)))} />
              <TextInput label="Cupom" isOptional value={l.coupon ?? ""} onChange={(v) => setLinks(links.map((x, j) => (j === i ? { ...x, coupon: v } : x)))} />
              <Button label={`Remover loja ${i + 1}`} variant="ghost" size="sm" onClick={() => setLinks(links.filter((_, j) => j !== i))}>
                Remover
              </Button>
            </div>
          ))}
          <div>
            <Button label="Adicionar loja" variant="secondary" size="sm" onClick={() => setLinks([...links, emptyLink()])} />
          </div>
        </fieldset>

        {error && <p className={styles.error} role="alert">{error}</p>}
        <div className={styles.actions}>
          <Button label="Salvar" variant="primary" type="submit" isLoading={busy} />
          <Button label="Cancelar" variant="ghost" onClick={onClose} />
        </div>
      </form>
    </>
  );
}
