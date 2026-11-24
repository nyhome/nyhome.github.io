"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { IconButton } from "@astryxdesign/core/IconButton";
import type { Photo } from "@/data/gifts";
import { useReducedMotion } from "@/lib/hooks";
import styles from "./Gallery.module.css";

const Chevron = ({ dir }: { dir: "left" | "right" }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
    <path d={dir === "left" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Ordered photos with arrows, thumbnails and native swipe (scroll-snap). One photo: no controls. */
export function Gallery({ photos, name }: { photos: Photo[]; name: string }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const reduced = useReducedMotion();
  const many = photos.length > 1;

  const go = (i: number) => {
    const el = track.current;
    if (!el) return;
    const next = Math.min(Math.max(i, 0), photos.length - 1);
    el.scrollTo({ left: next * el.clientWidth, behavior: reduced ? "auto" : "smooth" });
  };

  return (
    <div className={styles.gallery}>
      <div className={styles.frame}>
        <div
          ref={track}
          className={styles.track}
          onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") go(index + 1);
            if (e.key === "ArrowLeft") go(index - 1);
          }}
          tabIndex={many ? 0 : undefined}
          role={many ? "region" : undefined}
          aria-roledescription={many ? "galeria" : undefined}
          aria-label={many ? `Fotos de ${name}` : undefined}
        >
          {photos.map((ph, i) => (
            <div key={ph.id + i} className={styles.slide} aria-label={many ? `Foto ${i + 1} de ${photos.length}` : undefined}>
              <Image
                src={`https://images.unsplash.com/photo-${ph.id}`}
                alt={ph.alt}
                fill
                sizes="(max-width: 860px) 100vw, 520px"
              />
            </div>
          ))}
        </div>
        {many && (
          <>
            <div className={`${styles.arrow} ${styles.prev}`}>
              <IconButton label="Foto anterior" icon={<Chevron dir="left" />} variant="primary" size="sm" elevation="low" isDisabled={index === 0} onClick={() => go(index - 1)} />
            </div>
            <div className={`${styles.arrow} ${styles.next}`}>
              <IconButton
                label="Próxima foto"
                icon={<Chevron dir="right" />}
                variant="primary"
                size="sm"
                elevation="low"
                isDisabled={index === photos.length - 1}
                onClick={() => go(index + 1)}
              />
            </div>
          </>
        )}
      </div>
      {many && (
        <div className={styles.thumbs}>
          {photos.map((ph, i) => (
            <button
              key={ph.id + i}
              type="button"
              className={styles.thumb}
              aria-label={`Mostrar foto ${i + 1}`}
              aria-current={i === index ? "true" : undefined}
              onClick={() => go(i)}
            >
              <Image src={`https://images.unsplash.com/photo-${ph.id}`} alt="" fill sizes="72px" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
