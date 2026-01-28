import { useState } from "react";
import { setDoc, serverTimestamp } from "firebase/firestore";
import { playerRef } from "../lib/refs";
import { nanoid } from "nanoid";
import { THEME_NAMES } from "../theme/themes";



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
  const [attacks, setAttacks] = useState(player.attacks || []);
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



function addAttack() {
  setAttacks([
    ...attacks,
{
  id: nanoid(),
  name: "",
  kind: "weapon",
  ability: "str",
  bonusAdditional: 0,
  dice: "1d6",
  hasAttackRoll: true,
},

  ]);
}

function updateAttack(id, field, value) {
  setAttacks(
    attacks.map((a) =>
      a.id === id ? { ...a, [field]: value } : a
    )
  );
}

function removeAttack(id) {
  setAttacks(attacks.filter((a) => a.id !== id));
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
    attacks,
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
<select
  value={theme}
  onChange={(e) => setTheme(e.target.value)}
 className="ui-input"
>
  {THEME_NAMES.map((name) => (
    <option key={name} value={name}>
      {name}
    </option>
  ))}
</select>


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


<h3 style={{ marginTop: 16 }}>Ataques</h3>

{attacks.length === 0 && (
  <p style={{ opacity: 0.7, fontSize: 13 }}>
    Nenhum ataque cadastrado.
  </p>
)}

<div style={{ display: "grid", gap: 12 }}>
  {attacks.map((atk) => (
   <div
  key={atk.id}
  style={{
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 12,
    padding: 12,
    display: "grid",
    gap: 8,
  }}
>
  <input
    placeholder="Nome (ex: Rapier / Fire Bolt)"
    value={atk.name}
    onChange={(e) => updateAttack(atk.id, "name", e.target.value)}
     className="ui-input"
  />

  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
    <select
      value={atk.kind || "weapon"}
      onChange={(e) => {
        const kind = e.target.value;
        updateAttack(atk.id, "kind", kind);
        if (kind === "weapon") updateAttack(atk.id, "hasAttackRoll", true);
      }}
      style={{ ...styles.input, flex: 1, minWidth: 140 }}
    >
      <option value="weapon">Arma</option>
      <option value="spell">Magia</option>
    </select>

    <select
      value={atk.ability || "str"}
      onChange={(e) => updateAttack(atk.id, "ability", e.target.value)}
      style={{ ...styles.input, flex: 1, minWidth: 160 }}
    >
      <option value="str">Força</option>
      <option value="dex">Destreza</option>
      <option value="con">Constituição</option>
      <option value="int">Inteligência</option>
      <option value="wis">Sabedoria</option>
      <option value="cha">Carisma</option>
    </select>

    <input
      type="number"
      placeholder="Bônus"
      value={Number(atk.bonusAdditional || 0)}
      onChange={(e) => updateAttack(atk.id, "bonusAdditional", Number(e.target.value))}
      style={{ ...styles.input, width: 90, minWidth: 90 }}
      title="Bônus adicionais"
    />
  
  {atk.kind === "spell" && (
    <label style={{ display: "flex", alignItems: "center", gap: 10, opacity: 0.9 }}>
      <input
        type="checkbox"
        checked={atk.hasAttackRoll === false}
        onChange={(e) => updateAttack(atk.id, "hasAttackRoll", !e.target.checked)}
      />
      Não possui teste de ataque (magia acerta automaticamente)
    </label>
  )}
</div>

  <input
    placeholder="Rolagem dos dados (ex: 1d8+4 / 2d6+3)"
    value={atk.dice || ""}
    onChange={(e) => updateAttack(atk.id, "dice", e.target.value)}
    className="ui-input"
  />

  <button
    onClick={() => removeAttack(atk.id)}
    style={{
      ...styles.button,
      background: "rgba(255,80,80,0.15)",
      borderColor: "rgba(255,80,80,0.35)",
    }}
  >
    Remover ataque
  </button>
</div>
  ))}
</div>

<button onClick={addAttack} style={{ ...styles.button, marginTop: 12 }}>
  + Adicionar ataque
</button>


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
