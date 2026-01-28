import { useState } from "react";
import { setDoc, serverTimestamp } from "firebase/firestore";
import { playerRef } from "../lib/refs";
const ABILITIES = [
  ["str", "Força"],
  ["dex", "Destreza"],
  ["con", "Constituição"],
  ["int", "Inteligência"],
  ["wis", "Sabedoria"],
  ["cha", "Carisma"],
];


export default function PlayerSetup({ playerId, initialPlayer }) {
  const [displayName, setDisplayName] = useState(initialPlayer?.displayName || "");
  const [level, setLevel] = useState(initialPlayer?.level || 1);
const [abilities, setAbilities] = useState(
  initialPlayer?.abilities || {
    str: 10,
    dex: 10,
    con: 10,
    int: 10,
    wis: 10,
    cha: 10,
  }
);

function updateAbility(key, value) {
  setAbilities({
    ...abilities,
    [key]: Number(value),
  });
}


  async function saveSetup() {
    await setDoc(
      playerRef(playerId),
      {
        displayName: displayName.trim() || playerId,
        level: Number(level) || 1, abilities,
        hasSetup: true,
        updatedAt: serverTimestamp(),
        
      },
      { merge: true }
    );
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <h1 style={{ marginTop: 0 }}>Configuração inicial</h1>

        <label style={styles.label}>Nome do personagem</label>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Ex: Chloë"
          style={styles.input}
        />

        <label style={styles.label}>Nível</label>
        <input
          type="number"
          min={1}
          value={level}
          onChange={(e) => setLevel(e.target.value)}
          style={styles.input}
        />
<h3 style={{ marginTop: 16 }}>Atributos</h3>

{ABILITIES.map(([key, label]) => (
  <div
    key={key}
    style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}
  >
    <span>{label}</span>
    <input
      type="number"
      min={1}
      value={abilities[key]}
      onChange={(e) => updateAbility(key, e.target.value)}
      style={{ width: 64 }}
    />
  </div>
))}


        <button onClick={saveSetup} style={styles.button}>
          Salvar e continuar
        </button>

        <p style={styles.muted}>
          (Calma: atributos/perícias/ataques a gente adiciona no próximo passo.)
        </p>
      </div>
    </div>
  );
}

const styles = {
  wrap: { width: "100%", minHeight: "100vh", padding: 16, display: "grid", placeItems: "start" },
  card: {
    width: "100%",
    maxWidth: 520,
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 16,
    padding: 16,
  },
  label: { display: "block", marginTop: 10, marginBottom: 6, opacity: 0.8 },
  input: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.16)",
    background: "transparent",
    color: "inherit",
    outline: "none",
  },
  button: {
    marginTop: 14,
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(255,255,255,0.06)",
    color: "inherit",
    cursor: "pointer",
    fontWeight: 700,
  },
  muted: { marginTop: 10, opacity: 0.65, fontSize: 13 },
};
