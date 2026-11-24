"use client";

/* eslint-disable @next/next/no-img-element -- each slat shows a horizontally offset slice of the same
   image, which next/image's fill layout can't express; the URLs are already sized by Unsplash. */

import { useLayoutEffect, useRef, useState } from "react";
import { photoUrl } from "@/lib/catalog";
import { useReducedMotion, useSeenOnce } from "@/lib/hooks";
import type { Photo } from "@/data/gifts";
import styles from "./BrisePhoto.module.css";

const SLATS = 10;

function openSlats(slats: (HTMLDivElement | null)[]) {
  slats.forEach((slat, i) =>
    slat?.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], {
      duration: 620,
      delay: i * 38,
      easing: "cubic-bezier(.3,.7,.2,1)",
      fill: "backwards",
    }),
  );
}

interface Props {
  photo: Photo;
  /** Open the slats the first time the photo scrolls into view (phone layout). */
  revealOnView?: boolean;
  priority?: boolean;
  className?: string;
}

/**
 * A photo behind vertical louvers. When `photo` changes, the new image opens slat by slat over the
 * previous one, like a brise turning. Adapted from the Senawa redesign's project index.
 */
export function BrisePhoto({ photo, revealOnView = false, priority = false, className }: Props) {
  const reduced = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const slatRefs = useRef<(HTMLDivElement | null)[]>([]);
  const seen = useSeenOnce(rootRef);
  const src = photoUrl(photo.id, 1400);

  // Keep the previous photo underneath while the new one opens over it (React's "previous render" pattern).
  const [current, setCurrent] = useState(photo);
  const [base, setBase] = useState<Photo | null>(null);
  if (current.id !== photo.id) {
    setBase(current);
    setCurrent(photo);
  }

  // Layout effects so the slats are closed before the new image is ever painted.
  const isFirst = useRef(true);
  useLayoutEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    if (!reduced) openSlats(slatRefs.current);
  }, [photo.id, reduced]);

  // Phone layout: the first reveal waits until the photo is on screen.
  const hidden = revealOnView && !seen && !reduced;
  useLayoutEffect(() => {
    if (revealOnView && seen && !reduced) openSlats(slatRefs.current);
  }, [revealOnView, seen, reduced]);

  return (
    <div ref={rootRef} className={`${styles.panel} ${className ?? ""}`} data-hidden={hidden || undefined}>
      {base && <img className={styles.base} src={photoUrl(base.id, 1400)} alt="" aria-hidden />}
      <div className={styles.slats} role="img" aria-label={photo.alt}>
        {Array.from({ length: SLATS }, (_, i) => (
          <div
            key={i}
            className={styles.slat}
            ref={(el) => {
              slatRefs.current[i] = el;
            }}
          >
            <img
              src={src}
              alt=""
              style={{ left: `${-i * 100}%`, width: `${SLATS * 100}%` }}
              loading={priority ? "eager" : "lazy"}
              decoding="async"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
