import { useEffect, useMemo, useState } from "react";
import { onSnapshot, orderBy, query, limit } from "firebase/firestore";
import { rollsCol } from "../lib/refs";

/**
 * LiveFeed
 * - viewerId: id do player que está vendo (ex: "chloe") ou "mestre"
 * - isMaster: true quando viewer é mestre (vê tudo)
 */
export default function LiveFeed({
  viewerId,
  isMaster = false,
  title = "Rolagens ao vivo",
  className = "",
  maxItems = 15,
  ttlMinutes = 30,
}) {
  const [rolls, setRolls] = useState([]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    // Mostra apenas as últimas rolagens no painel (limitado no Firestore)
    const q = query(rollsCol(), orderBy("createdAt", "desc"), limit(maxItems));
    return onSnapshot(q, (snap) => {
      setRolls(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [maxItems]);

  // Atualiza o "agora" pra aplicar TTL sem precisar de nova rolagem
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const visibleRolls = useMemo(() => {
    const ttlMs = Number(ttlMinutes) * 60_000;
    return rolls.filter((r) => {
      const ms = r?.createdAt?.toMillis ? r.createdAt.toMillis() : null;
      if (!ms) return true; // fallback: se não tiver timestamp ainda
      return now - ms <= ttlMs;
    });
  }, [rolls, now, ttlMinutes]);

  function canSeeNumbers(roll) {
    if (!roll?.isSecret) return true;
    if (isMaster) return true;
    return roll.playerId === viewerId; // autor vê a própria secreta
  }

  return (
    <div className={`livefeed-card ${className}`} style={styles.card}>
      <h2 style={styles.h2}>{title}</h2>

      {visibleRolls.length === 0 ? (
        <p style={styles.muted}>Ainda sem rolagens.</p>
      ) : (
        <ul className="livefeed-list" style={styles.feed}>
          {visibleRolls.map((r) => {
            const show = canSeeNumbers(r);
            return (
              <li key={r.id} style={styles.feedItem}>
                <div style={styles.topRow}>
                  <div>
                    <strong>{r.playerId}</strong>{" "}
                    <span style={styles.muted}>
                      {r.type}
                      {r.subtype ? ` • ${r.subtype}` : ""}
                    </span>
                    {r.isSecret ? <span style={styles.secret}>SECRETA</span> : null}
                  </div>

                  <div style={styles.total}>{show ? r.total : "•••"}</div>
                </div>

                <div style={styles.muted}>{show ? r.detail : "Rolagem secreta"}</div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const styles = {
  card: {
    width: "100%",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 16,
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    minHeight: 0, // permite overflow correto quando usado em containers com height
  },
  h2: { margin: 0, fontSize: 16 },
  muted: { opacity: 0.7, fontSize: 13 },
  feed: {
    listStyle: "none",
    padding: 0,
    margin: 0,
    display: "grid",
    gap: 10,
    minHeight: 0,
  },
  feedItem: {
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 12,
    padding: 12,
    display: "grid",
    gap: 6,
  },
  topRow: { display: "flex", justifyContent: "space-between", gap: 12 },
  total: { fontWeight: 800 },
  secret: {
    marginLeft: 8,
    fontSize: 12,
    padding: "2px 8px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.18)",
    opacity: 0.85,
  },
};
