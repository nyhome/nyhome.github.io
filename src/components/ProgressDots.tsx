import { progressLabel } from "@/lib/catalog";
import styles from "./ProgressDots.module.css";

/**
 * "3 de 8 presentes escolhidos" drawn as a row of circles, one per gift, filled for confirmed purchases.
 * The circles come from the OTTO redesign's plan view; the text carries the meaning for screen readers.
 */
export function ProgressDots({ chosen, total, compact = false }: { chosen: number; total: number; compact?: boolean }) {
  return (
    <span className={styles.wrap} data-compact={compact || undefined}>
      <span className={styles.dots} aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={styles.dot} data-on={i < chosen || undefined} />
        ))}
      </span>
      <span className={styles.label}>{progressLabel({ chosen, total })}</span>
    </span>
  );
}
