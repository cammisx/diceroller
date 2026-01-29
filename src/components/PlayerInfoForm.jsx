import { useState } from "react";
import { setDoc, serverTimestamp } from "firebase/firestore";
import { playerRef } from "../lib/refs";
import ThemePicker from "./ThemePicker";



const ABILITIES = [
  ["str", "Força"],
  ["dex", "Destreza"],
  ["con", "Constituição"],
  ["int", "Inteligência"],
  ["wis", "Sabedoria"],
  ["cha", "Carisma"],
];

const SKILLS = [
  ["acrobatics", "Acrobacia"],
  ["animalHandling", "Adestrar Animais"],
  ["arcana", "Arcanismo"],
  ["athletics", "Atletismo"],
  ["deception", "Enganação"],
  ["history", "História"],
  ["insight", "Intuição"],
  ["intimidation", "Intimidação"],
  ["investigation", "Investigação"],
  ["medicine", "Medicina"],
  ["nature", "Natureza"],
  ["perception", "Percepção"],
  ["performance", "Atuação"],
  ["persuasion", "Persuasão"],
  ["religion", "Religião"],
  ["sleightOfHand", "Prestidigitação"],
  ["stealth", "Furtividade"],
  ["survival", "Sobrevivência"],
];



export default function PlayerInfoForm({ playerId, player, onDone }) {
  const [level, setLevel] = useState(player.level || 1);
  const [theme, setTheme] = useState(player.preferences?.theme || "Neon Tokyo");

  const [abilities, setAbilities] = useState(
    player.abilities || {
      str: 10,
      dex: 10,
      con: 10,
      int: 10,
      wis: 10,
      cha: 10,
    }
  );
  const [skills, setSkills] = useState(player.skills || {});

 function getSkill(key) {
  return skills[key] || { proficient: false, bonus: 0 };
}


function toggleProficient(key) {
  const current = getSkill(key);
  const next = { ...current, proficient: !current.proficient };

  setSkills({ ...skills, [key]: next });
}



  function updateAbility(key, value) {
    setAbilities({ ...abilities, [key]: Number(value) });
  }

  async function save() {
 await setDoc(
  playerRef(playerId),
  {
    level,
    abilities,
    skills,
    preferences: {
      ...(player.preferences || {}),
      theme,
      showSecret: player.preferences?.showSecret ?? true,
      showBonus: player.preferences?.showBonus ?? true,
      showCA: player.preferences?.showCA ?? true,
    },
    updatedAt: serverTimestamp(),
  },
  { merge: true }
);

    onDone?.();
  }

  return (
    <div style={styles.card}>
      <h2 style={{ marginTop: 0 }}>Informações do Jogador</h2>
      <h3 style={{ marginTop: 16 }}>Preferências</h3>

<label style={styles.label}>Tema</label>
<ThemePicker value={theme} onChange={setTheme} />
<label style={styles.label}>Nível</label>
      <input
        type="number"
        min={1}
        value={level}
        onChange={(e) => setLevel(Number(e.target.value))}
         className="ui-input"
      />

      <h3 style={{ marginTop: 16 }}>Atributos</h3>
      {ABILITIES.map(([key, label]) => (
        <div key={key} style={styles.row}>
          <span>{label}</span>
          <input
            type="number"
            min={1}
            value={abilities[key]}
            onChange={(e) => updateAbility(key, e.target.value)}
            className="ui-input"
          />
        </div>
      ))}
<h3 style={{ marginTop: 16 }}>Perícias</h3>

<div style={{ display: "grid", gap: 8 }}>
  {SKILLS.map(([key, label]) => {
    const s = getSkill(key);

    return (
      <div
        key={key}
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto auto",
          gap: 10,
          alignItems: "center",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 12,
          padding: 10,
        }}
      >
        <strong style={{ fontSize: 14 }}>{label}</strong>

        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, opacity: 0.9 }}>
          <input
            type="checkbox"
            checked={!!s.proficient}
            onChange={() => toggleProficient(key)}
          />
          Treinada
        </label>

        <input
          type="number"
          value={Number(s.bonus || 0)}
          onChange={(e) =>
            setSkills({
              ...skills,
              [key]: { ...s, bonus: Number(e.target.value) },
            })
          }
          style={{
            width: 72,
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.16)",
            background: "transparent",
            color: "inherit",
            opacity: 0.95,
          }}
          placeholder="Bônus"
          title="Bônus adicionais"
        />
      </div>
    );
  })}
</div>


    <button onClick={save} className="ui-btn">
  Salvar
</button>

    </div>
  );
}

const styles = {
  card: {
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 16,
    padding: 16,
  },
  label: { display: "block", marginBottom: 6, opacity: 0.8 },
  input: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.16)",
    background: "transparent",
    color: "inherit",
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  inputSmall: { width: 64, padding: 6 },
  button: {
    marginTop: 12,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(255,255,255,0.06)",
    color: "inherit",
    cursor: "pointer",
    fontWeight: 700,
  },
};
