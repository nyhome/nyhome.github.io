"use client";

import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { Gift, Room, RoomId } from "@/data/gifts";
import type { PriceRangeId } from "@/lib/catalog";
import { Catalog } from "./Catalog";
import { GiftDialog } from "./GiftDialog";
import { Rooms } from "./Rooms";

/** Owns the preview's state: filters, the open gift, and in-memory reservations. */
export function GiftList({ rooms, initialGifts }: { rooms: Room[]; initialGifts: Gift[] }) {
  const [gifts, setGifts] = useState(initialGifts);
  const [room, setRoom] = useState<RoomId | "todos">("todos");
  const [price, setPrice] = useState<PriceRangeId>("todos");
  const [openId, setOpenId] = useState<string | null>(null);
  const trigger = useRef<HTMLElement | null>(null);

  const open = gifts.find((g) => g.id === openId) ?? null;

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
      <Rooms rooms={rooms} gifts={gifts} onShowGifts={showGifts} />
      <Catalog
        rooms={rooms}
        gifts={gifts}
        room={room}
        price={price}
        onRoomChange={setRoom}
        onPriceChange={setPrice}
        onOpen={(g, el) => {
          trigger.current = el;
          setOpenId(g.id);
        }}
      />
      <GiftDialog
        gift={open}
        onClose={close}
        onReserve={(g) => setGifts((list) => list.map((x) => (x.id === g.id ? { ...x, status: "reserved" } : x)))}
      />
    </>
  );
}
