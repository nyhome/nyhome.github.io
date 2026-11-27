"use client";

import { useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Selector } from "@astryxdesign/core/Selector";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { ROOMS, VOLTAGES, type Gift, type GiftLink, type RoomId, type Voltage } from "@/data/gifts";
import { AdminError, saveGift } from "@/lib/admin";
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

// "1.299,90" / "1.299" (pt-BR) or "1299.90": a comma, or dots grouping thousands, mean pt-BR.
const parsePrice = (p: string) => Number(p.includes(",") || /^\d{1,3}(\.\d{3})+$/.test(p) ? p.replace(/\./g, "").replace(",", ".") : p);

const emptyLink = (): GiftLink => ({ store: "", url: "", coupon: "" });

function Form({ gift, onClose, onSaved }: { gift: Gift | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(gift?.name ?? "");
  const [model, setModel] = useState(gift?.model ?? "");
  const [brand, setBrand] = useState(gift?.brand ?? "");
  const [room, setRoom] = useState<RoomId | undefined>(gift?.room);
  const [price, setPrice] = useState(gift ? String(gift.price) : "");
  const [lowestPrice, setLowestPrice] = useState(gift ? String(gift.lowestPrice) : "");
  const [quantity, setQuantity] = useState(String(gift?.quantity ?? 1));
  const [dims, setDims] = useState(gift?.dims ?? "");
  const [voltage, setVoltage] = useState<Voltage | "">(gift?.voltage ?? "");
  const [description, setDescription] = useState(gift?.description ?? "");
  const [photos, setPhotos] = useState<string[]>(gift?.photos.length ? gift.photos : [""]);
  const [links, setLinks] = useState<GiftLink[]>(gift?.links.length ? gift.links : [emptyLink()]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = parsePrice(price.trim());
    // Empty = the price itself; saveGift keeps the smaller of the two, so a cheaper price lowers it on its own.
    const lowest = lowestPrice.trim() ? parsePrice(lowestPrice.trim()) : value;
    const cleanLinks = links.filter((l) => l.url.trim()).map((l) => ({ store: l.store.trim() || "Loja", url: l.url.trim(), coupon: l.coupon?.trim() }));
    if (!name.trim() || !room || !price.trim() || !Number.isFinite(value) || value < 0) {
      setError("Preencha nome, cômodo e um preço válido.");
      return;
    }
    if (!Number.isFinite(lowest) || lowest < 0) {
      setError("O menor preço precisa ser um valor válido.");
      return;
    }
    if (cleanLinks.some((l) => !/^https?:\/\//.test(l.url))) {
      setError("Os links precisam começar com http:// ou https://.");
      return;
    }
    const qty = Number(quantity);
    // Units already held or bought can't disappear from under the guests who took them.
    const taken = gift ? gift.boughtUnits + gift.heldUnits : 0;
    if (!Number.isInteger(qty) || qty < 1 || qty > 50) {
      setError("Quantidade precisa ser um número inteiro de 1 a 50.");
      return;
    }
    if (qty < taken) {
      setError(`Já tem ${taken} ${taken === 1 ? "unidade reservada ou comprada" : "unidades reservadas ou compradas"}; a quantidade não pode ser menor.`);
      return;
    }
    setBusy(true);
    try {
      await saveGift(gift?.id ?? null, {
        room, name: name.trim(), model: model.trim(), brand: brand.trim(), description: description.trim(), dims: dims.trim(), voltage, quantity: qty,
        price: value, lowestPrice: lowest, links: cleanLinks, photos: photos.map((p) => p.trim()).filter(Boolean),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof AdminError ? err.message : "Não deu para salvar. Tente de novo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DialogHeader title={gift ? "Editar presente" : "Novo presente"} subtitle={gift ? undefined : "Entra como rascunho; publique quando estiver pronto."} onOpenChange={(o) => !o && onClose()} />
      <form className={`${styles.form} ${styles.dialogScroll}`} onSubmit={submit} noValidate>
        <TextInput label="Nome no catálogo" description="Curto, como aparece no card." value={name} onChange={setName} isRequired />
        <TextInput label="Modelo completo" description="O texto exato que o convidado vai buscar na loja." value={model} onChange={setModel} />
        <div className={styles.cols}>
          <Selector label="Cômodo" placeholder="Escolha" options={ROOMS.map((r) => ({ value: r.id, label: r.name }))} value={room} onChange={(v) => setRoom(v as RoomId)} isRequired />
          <TextInput label="Preço de referência (R$)" description="Por unidade." value={price} onChange={setPrice} isRequired />
        </div>
        <TextInput
          label="Menor preço já visto (R$)"
          description="Guarda sozinho o menor preço salvo. Se viu mais barato em outro lugar, coloque aqui."
          value={lowestPrice}
          onChange={setLowestPrice}
          isOptional
        />
        <TextInput
          label="Quantidade"
          description="Quantas unidades vocês querem. Cada convidado escolhe quantas vai dar."
          type="text"
          value={quantity}
          onChange={setQuantity}
          isRequired
        />
        <div className={styles.cols}>
          <TextInput label="Marca" value={brand} onChange={setBrand} isOptional />
          <TextInput label="Medidas" value={dims} onChange={setDims} isOptional />
        </div>
        <Selector
          label="Voltagem"
          description="Só para eletrônicos e eletrodomésticos."
          options={[{ value: "", label: "Não se aplica" }, ...VOLTAGES.map((v) => ({ value: v, label: v }))]}
          value={voltage}
          onChange={(v) => setVoltage(v as Voltage | "")}
        />
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
