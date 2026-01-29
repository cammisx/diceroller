import { useEffect, useMemo, useState } from "react";
import { addDoc, onSnapshot, orderBy, query, limit, serverTimestamp } from "firebase/firestore";
import { rollsCol } from "../lib/refs";
import { rollDiceExpression, formatDiceResult } from "../lib/dice";

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

  const damageAlreadyRolledFor = useMemo(() => {
    const set = new Set();
    for (const r of visibleRolls) {
      if (r?.type === "Dano" && r?.fromAttackRollId) set.add(r.fromAttackRollId);
    }
    return set;
  }, [visibleRolls]);

  // para esconder o botão "Rolar dano" quando o dano já foi rolado a partir daquele ataque
  const damageByAttackId = useMemo(() => {
    const m = new Map();
    for (const r of visibleRolls) {
      if (r?.type === "Dano" && r?.fromAttackRollId) m.set(r.fromAttackRollId, true);
    }
    return m;
  }, [visibleRolls]);

  function canSeeNumbers(roll) {
    if (!roll?.isSecret) return true;
    if (isMaster) return true;
    return roll.playerId === viewerId; // autor vê a própria secreta
  }

  async function rollDamageFromAttack(attackRoll) {
    const expr = String(attackRoll?.damageExpr || "").trim();
    if (!expr) return;
    const diceResult = rollDiceExpression(expr);
    if (!diceResult) {
      alert(`Expressão de dano inválida: "${expr}"`);
      return;
    }
    const diceText = formatDiceResult(diceResult);
    await addDoc(rollsCol(), {
      playerId: attackRoll.playerId,
      isSecret: !!attackRoll.isSecret,
      createdAt: serverTimestamp(),
      type: "Dano",
      subtype: attackRoll.subtype || "Dano",
      total: diceResult.total,
      fromAttackRollId: attackRoll.id,
      detail: `${attackRoll?.attackKind === "spell" ? "Magia" : "Arma"} • ${diceText}`,
    });
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
            const canRollDamageBtn =
              r?.type === "Ataque" &&
              r?.playerId === viewerId &&
              !!(r?.damageExpr || "").trim() &&
              r?.nat20 !== true &&
              !damageAlreadyRolledFor.has(r.id);

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

                {canRollDamageBtn ? (
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      style={styles.damageBtn}
                      onClick={async () => {
                        const expr = String(r.damageExpr || "").trim();
                        const diceResult = rollDiceExpression(expr);
                        if (!diceResult) {
                          alert(`Expressão de dano inválida: "${expr}"`);
                          return;
                        }
                        const text = formatDiceResult(diceResult);
                        await addDoc(rollsCol(), {
                          playerId: viewerId,
                          isSecret: !!r.isSecret,
                          createdAt: serverTimestamp(),
                          type: "Dano",
                          subtype: r.subtype || "Dano",
                          total: diceResult.total,
                          fromAttackRollId: r.id,
                          detail: `${text}`,
                        });
                      }}
                    >
                      Rolar dano
                    </button>
                  </div>
                ) : null}
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
  damageBtn: {
    marginTop: 6,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    padding: "8px 10px",
    fontWeight: 700,
    cursor: "pointer",
  },
  secret: {
    marginLeft: 8,
    fontSize: 12,
    padding: "2px 8px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.18)",
    opacity: 0.85,
  },
};
