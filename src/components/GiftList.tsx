"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { Delivery, Gift, Room, RoomId } from "@/data/gifts";
import type { PriceRangeId, SortId } from "@/lib/catalog";
import { fetchDelivery, fetchGifts } from "@/lib/firebase";
import { Catalog } from "./Catalog";
import { GiftDialog } from "./GiftDialog";
import { Rooms } from "./Rooms";

/** Owns the page state: the gifts from Firestore, filters and the open gift. */
export function GiftList({ rooms }: { rooms: Room[] }) {
  const [gifts, setGifts] = useState<Gift[] | null>(null);
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [failed, setFailed] = useState(false);
  const [room, setRoom] = useState<RoomId | "todos">("todos");
  const [price, setPrice] = useState<PriceRangeId>("todos");
  const [sort, setSort] = useState<SortId>("menor");
  const [openId, setOpenId] = useState<string | null>(null);
  const trigger = useRef<HTMLElement | null>(null);

  const load = useCallback(
    () =>
      Promise.all([fetchGifts(), fetchDelivery()])
        .then(([g, d]) => {
          setGifts(g);
          setDelivery(d);
          setFailed(false);
        })
        .catch(() => setFailed(true)),
    [],
  );

  useEffect(() => {
    load();
  }, [load]);

  const list = gifts ?? [];
  const open = list.find((g) => g.id === openId) ?? null;

  // A room's "Ver presentes": clear the filters so that room's group exists, then jump to it.
  const showGifts = (id: RoomId) => {
    flushSync(() => {
      setRoom("todos");
      setPrice("todos");
    });
    document.getElementById(`presentes-${id}`)?.scrollIntoView({ block: "start" });
  };

  const close = () => {
    setOpenId(null);
    // The dialog restores focus itself; this covers triggers it can't see (e.g. a card re-rendered meanwhile).
    const el = trigger.current;
    requestAnimationFrame(() => {
      if (el?.isConnected && document.activeElement === document.body) el.focus();
    });
  };

  return (
    <>
      <Rooms rooms={rooms} gifts={list} onShowGifts={showGifts} />
      <Catalog
        rooms={rooms}
        gifts={list}
        status={failed ? "error" : gifts === null ? "loading" : "ready"}
        onRetry={load}
        room={room}
        price={price}
        sort={sort}
        onSortChange={setSort}
        onRoomChange={setRoom}
        onPriceChange={setPrice}
        onOpen={(g, el) => {
          trigger.current = el;
          setOpenId(g.id);
        }}
      />
      <GiftDialog gift={open} delivery={delivery} onClose={close} onChanged={load} />
    </>
  );
}
