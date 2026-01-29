import { useParams } from "react-router-dom";
import { addDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { playerRef, rollsCol } from "../lib/refs";
import { useState, useEffect, useMemo } from "react";
import { getTheme } from "../theme/themes";
import { applyThemeVars } from "../theme/applyTheme";

import LiveFeed from "../components/LiveFeed.jsx";
import { usePlayer } from "../hooks/usePlayer";
import PlayerSetup from "../components/playerSetup.jsx";
import PlayerInfoForm from "../components/PlayerInfoForm";
import Modal from "../components/Modal";
import Drawer from "../components/Drawer";
import { rollD20, abilityModifier, rollDiceExpression, formatDiceResult } from "../lib/dice";
import { nanoid } from "nanoid";
import { SKILL_DESCRIPTIONS } from "../data/skillDescriptions";


const RACES_5E = [
  "Aasimar","Anão","Autognomo","Astral Elf","Centauro","Changeling","Dhampir","Draconato","Elfo","Fada","Firbolg","Genasi (Ar)","Genasi (Terra)","Genasi (Fogo)","Genasi (Água)",
  "Giff","Githyanki","Githzerai","Gnomo","Goblin","Goliath","Hadozee","Halfling","Harengon","Hexblood","Hobgoblin","Humano","Kalashtar","Kenku","Kobold","Leonino","Lizardfolk",
  "Meio-elfo","Meio-orc","Minotauro","Orc","Owlin","Plasmoid","Reborn","Satyr","Shifter","Simic Hybrid","Tabaxi","Thri-kreen","Tortle","Triton","Vedalken","Warforged","Yuan-ti","Outro"
];

const CLASSES_5E = [
  "Artífice","Bárbaro","Bardo","Bruxo","Clérigo","Druida","Feiticeiro","Guerreiro","Ladino","Mago","Monge","Paladino","Patrulheiro"
];

const ALIGNMENTS_5E = [
  "Leal e Bom","Neutro e Bom","Caótico e Bom",
  "Leal e Neutro","Neutro","Caótico e Neutro",
  "Leal e Mau","Neutro e Mau","Caótico e Mau"
];

const ABILITIES = [
  { key: "str", label: "Força", short: "FOR" },
  { key: "dex", label: "Destreza", short: "DES" },
  { key: "con", label: "Constituição", short: "CON" },
  { key: "int", label: "Inteligência", short: "INT" },
  { key: "wis", label: "Sabedoria", short: "SAB" },
  { key: "cha", label: "Carisma", short: "CAR" },
];

const SKILLS = [
  { key: "acrobatics", label: "Acrobacia", ability: "dex" },
  { key: "animalHandling", label: "Adestrar Animais", ability: "wis" },
  { key: "arcana", label: "Arcanismo", ability: "int" },
  { key: "athletics", label: "Atletismo", ability: "str" },
  { key: "deception", label: "Enganação", ability: "cha" },
  { key: "history", label: "História", ability: "int" },
  { key: "insight", label: "Intuição", ability: "wis" },
  { key: "intimidation", label: "Intimidação", ability: "cha" },
  { key: "investigation", label: "Investigação", ability: "int" },
  { key: "medicine", label: "Medicina", ability: "wis" },
  { key: "nature", label: "Natureza", ability: "int" },
  { key: "perception", label: "Percepção", ability: "wis" },
  { key: "performance", label: "Atuação", ability: "cha" },
  { key: "persuasion", label: "Persuasão", ability: "cha" },
  { key: "religion", label: "Religião", ability: "int" },
  { key: "sleightOfHand", label: "Prestidigitação", ability: "dex" },
  { key: "stealth", label: "Furtividade", ability: "dex" },
  { key: "survival", label: "Sobrevivência", ability: "wis" },
];

function ShieldLevel({ level }) {
  const L = Number(level) || 1;
  return (
    <div className="shield-badge" title={`Nível ${L}`}>
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <path
          d="M32 4c8 7 16 10 24 12v18c0 15-9 24-24 30C17 58 8 49 8 34V16c8-2 16-5 24-12z"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
        />
      </svg>
      <span className="shield-level">{L}</span>
    </div>
  );
}


function buildCritExpression(expr, multiplier = 2) {
  const clean = String(expr || "").trim().toLowerCase().replace(/\s+/g, "");
  if (!clean) return "";
  // Dobra apenas os dados (mantém bônus numéricos)
  return clean.replace(/(\d*)d(\d+)/g, (_, c, sides) => {
    const count = c ? parseInt(c, 10) : 1;
    const next = Math.max(1, count * (Number(multiplier) || 2));
    return `${next}d${sides}`;
  });
}

// Aplica modificadores de crítico no TOTAL do dano base, em ordem (esq -> dir).
// Exemplos:
//  - "x2 + 3" => (base * 2) + 3
//  - "+2 x3"  => (base + 2) * 3
// Aceita tokens: +N, -N, xN, *N, /N (com ou sem espaços).
function applyCritOps(baseTotal, opsRaw) {
  let value = Number(baseTotal) || 0;
  const raw = String(opsRaw || "").trim().toLowerCase();
  if (!raw) return value;

  const tokens = raw.match(/([+\-]\s*\d+|x\s*\d+|\*\s*\d+|\/\s*\d+)/g);
  if (!tokens) return value;

  for (const t of tokens) {
    const tok = t.replace(/\s+/g, "");
    if (!tok) continue;

    if (tok.startsWith("+")) {
      value = value + (Number(tok.slice(1)) || 0);
      continue;
    }
    if (tok.startsWith("-")) {
      value = value - (Number(tok.slice(1)) || 0);
      continue;
    }
    if (tok.startsWith("x") || tok.startsWith("*")) {
      const m = Number(tok.slice(1));
      if (Number.isFinite(m)) value = value * m;
      continue;
    }
    if (tok.startsWith("/")) {
      const d = Number(tok.slice(1));
      if (Number.isFinite(d) && d !== 0) value = value / d;
      continue;
    }
  }

  // arredonda para inteiro, porque dano em RPG normalmente é inteiro
  return Math.round(value);
}

export default function PlayerPage() {
  const { playerId } = useParams();
  const { player, loading } = usePlayer(playerId);

  const [showInfo, setShowInfo] = useState(false);
  const [showRoller, setShowRoller] = useState(false);
  const [activeTab, setActiveTab] = useState("stats");

  const [isSecretRoll, setIsSecretRoll] = useState(false);
  const [isAdvantage, setIsAdvantage] = useState(false);
  const [isDisadvantage, setIsDisadvantage] = useState(false);

  const [rollType, setRollType] = useState("Atributo");
  const [selectedAbility, setSelectedAbility] = useState("str");
  const [selectedSkill, setSelectedSkill] = useState("perception");
  const [selectedAttackId, setSelectedAttackId] = useState("");
  const [freeExpr, setFreeExpr] = useState("");

  // UI modals
  const [skillInfoKey, setSkillInfoKey] = useState(null);
  const [showAddAction, setShowAddAction] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [showAddNote, setShowAddNote] = useState(false);

  // Forms locais (salvos por aba)
  const [statsForm, setStatsForm] = useState({
    race: "",
    className: "",
    background: "",
    alignment: "",
    hpMax: 0,
    hpCurrent: 0,
    xp: 0,
    level: 1,
  });

  const [currencyForm, setCurrencyForm] = useState({ bronze: 0, prata: 0, ouro: 0 });

  const [newAction, setNewAction] = useState({
    type: "Ataque",
    name: "",
    description: "",
    dice: "",
    crit: "",
    critOn: "",
    ability: "str", // str | dex | none
    bonusAdditional: 0,
    hasAttackRoll: true,
  });

  const [newItem, setNewItem] = useState({ name: "", description: "", weight: "" });
  const [newNote, setNewNote] = useState({ date: new Date().toISOString().slice(0, 10), text: "" });

  useEffect(() => {
    const themeName = player?.preferences?.theme || "Neon Tokyo";
    applyThemeVars(getTheme(themeName));
  }, [player?.preferences?.theme]);

  // Sincroniza forms quando o player carregar
  useEffect(() => {
    if (!player) return;
    setStatsForm({
      race: player.race || "",
      className: player.className || "",
      background: player.background || "",
      alignment: player.alignment || "",
      hpMax: Number(player.hpMax || 0),
      hpCurrent: Number(player.hpCurrent || 0),
      xp: Number(player.xp || 0),
      level: Number(player.level || 1),
    });
    setCurrencyForm({
      bronze: Number(player.currency?.bronze || 0),
      prata: Number(player.currency?.prata || 0),
      ouro: Number(player.currency?.ouro || 0),
    });
  }, [player]);

  function proficiencyBonus(level) {
    const L = Number(level) || 1;
    return 2 + Math.floor((L - 1) / 4);
  }

  const attacksAll = useMemo(() => (Array.isArray(player?.attacks) ? player.attacks : []), [player?.attacks]);

  const attacksForAttackRoll = useMemo(() => {
    return attacksAll.filter((a) => {
      if (!a) return false;
      if (a.kind === "spell") return a.hasAttackRoll !== false; // padrão: true
      return true; // armas sempre entram
    });
  }, [attacksAll]);

  // ⚠️ Importante: hooks não podem ficar "depois" de returns condicionais.
  // Então a parte de computar perícias fica aqui em cima e lida com player indefinido.
  const levelNow = player?.level || 1;
  const pbNow = proficiencyBonus(levelNow);
  const skillComputed = useMemo(() => {
    return SKILLS.map((s) => {
      const score = player?.abilities?.[s.ability] ?? 10;
      const mod = abilityModifier(score);
      const entry = player?.skills?.[s.key] || { proficient: false, bonus: 0 };
      const prof = entry.proficient ? pbNow : 0;
      const extra = Number(entry.bonus || 0);
      return {
        ...s,
        proficient: !!entry.proficient,
        totalBonus: mod + prof + extra,
        mod,
        prof,
        extra,
      };
    });
  }, [player?.abilities, player?.skills, pbNow]);

  // Mantém um ataque selecionado válido
  useEffect(() => {
    const list = rollType === "Ataque" ? attacksForAttackRoll : attacksAll;
    const currentInList = list.some((a) => a?.id === selectedAttackId);
    if (!currentInList) {
      setSelectedAttackId(list[0]?.id || "");
    }
  }, [rollType, attacksAll, attacksForAttackRoll, selectedAttackId]);

  function rollD20WithState() {
    // Vantagem/Desvantagem: rola 2d20 e pega maior/menor
    if (!isAdvantage && !isDisadvantage) {
      const d20 = rollD20();
      return { d20, detail: `d20(${d20})` };
    }
    const a = rollD20();
    const b = rollD20();
    const chosen = isAdvantage ? Math.max(a, b) : Math.min(a, b);
    const mode = isAdvantage ? "vantagem" : "desvantagem";
    return { d20: chosen, detail: `2d20(${a}, ${b}) → ${chosen} (${mode})` };
  }

  async function logRoll(payload) {
    await addDoc(rollsCol(), {
      playerId,
      isSecret: isSecretRoll,
      createdAt: serverTimestamp(),
      ...payload,
    });
  }

  async function mergePlayer(partial) {
    await setDoc(
      playerRef(playerId),
      {
        ...partial,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  async function rollAbility() {
    const info = ABILITIES.find((a) => a.key === selectedAbility) || ABILITIES[0];
    const score = player.abilities?.[info.key] ?? 10;
    const mod = abilityModifier(score);

    const d20res = rollD20WithState();
    const total = d20res.d20 + mod;

    await logRoll({
      type: "Atributo",
      subtype: info.label,
      total,
      detail: `${d20res.detail} ${mod >= 0 ? "+" : ""}${mod}`,
    });
  }

  async function rollSkill() {
    const skill = SKILLS.find((s) => s.key === selectedSkill);
    if (!skill) return;

    const score = player.abilities?.[skill.ability] ?? 10;
    const mod = abilityModifier(score);

    const s = player.skills?.[skill.key] || { proficient: false, bonus: 0 };
    const pb = proficiencyBonus(player.level);
    const prof = s.proficient ? pb : 0;
    const extra = Number(s.bonus || 0);

    const d20res = rollD20WithState();
    const total = d20res.d20 + mod + prof + extra;

    await logRoll({
      type: "Perícia",
      subtype: skill.label,
      total,
      detail: `${d20res.detail} ${mod >= 0 ? "+" : ""}${mod}${prof ? ` +PB(${pb})` : ""}${
        extra ? ` ${extra >= 0 ? "+" : ""}${extra}` : ""
      }`,
    });
  }

  async function rollSkillQuick(skillKey) {
    const skill = SKILLS.find((s) => s.key === skillKey);
    if (!skill || !player) return;

    const score = player.abilities?.[skill.ability] ?? 10;
    const mod = abilityModifier(score);

    const s = player.skills?.[skill.key] || { proficient: false, bonus: 0 };
    const pb = proficiencyBonus(player.level);
    const prof = s.proficient ? pb : 0;
    const extra = Number(s.bonus || 0);

    const d20 = rollD20();
    const total = d20 + mod + prof + extra;

    // por padrão NÃO é secreta
    await addDoc(rollsCol(), {
      playerId,
      isSecret: false,
      createdAt: serverTimestamp(),
      type: "Perícia",
      subtype: skill.label,
      total,
      detail: `d20(${d20}) ${mod >= 0 ? "+" : ""}${mod}${prof ? ` +PB(${pb})` : ""}${
        extra ? ` ${extra >= 0 ? "+" : ""}${extra}` : ""
      }`,
    });
  }

  async function rollAttackToHit() {
    const atk = attacksForAttackRoll.find((a) => a.id === selectedAttackId);
    if (!atk) return alert("Selecione um ataque.");

    // atributo: Força, Destreza ou Nenhum
    const abilityKey = (atk.ability || "str").toLowerCase();
    const mod = abilityKey === "none" ? 0 : abilityModifier(player.abilities?.[abilityKey] ?? 10);

    const bonusAdditional = Number(atk.bonusAdditional || 0);
    const pb = proficiencyBonus(player.level);

    const d20res = rollD20WithState();
    const total = d20res.d20 + mod + pb + bonusAdditional;

    // crit no dado (ex: 18 => 18,19,20 crita)
    const critOn = Number(atk.critOn);
    const critTriggered = d20res.d20 === 20 || (Number.isFinite(critOn) && critOn >= 2 && d20res.d20 >= critOn);

    // Precisamos do ID do doc pra permitir "Rolar dano" no feed e/ou auto-dano no crítico.
    const attackDoc = await addDoc(rollsCol(), {
      playerId,
      isSecret: isSecretRoll,
      createdAt: serverTimestamp(),
      type: "Ataque",
      subtype: atk.name || "Ataque",
      total,
      nat20: d20res.d20 === 20,
      crit: critTriggered,
      attackId: atk.id,
      damageExpr: atk.dice || "",
      detail: `${d20res.detail} ${mod >= 0 ? "+" : ""}${mod} +PB(${pb})${
        bonusAdditional ? ` ${bonusAdditional >= 0 ? "+" : ""}${bonusAdditional}` : ""
      } = ${total} • ${atk.kind === "spell" ? "Magia" : "Arma"}${critTriggered ? " • CRÍTICO!" : ""}`,
    });

    // crítico -> rola dano automaticamente junto (com regra custom)
    if (critTriggered && (atk.dice || "").trim()) {
      const baseRes = rollDiceExpression(atk.dice || "");
      const baseText = baseRes ? formatDiceResult(baseRes) : `(dice inválido: "${atk.dice || ""}")`;
      const baseTotal = baseRes?.total ?? 0;

      const critMod = String(atk.crit || "").trim();
      let finalTotal = baseTotal;
      let detailSuffix = "";

      if (critMod) {
        // Se tiver "d" (ex: 4d8+3), interpreta como expressão completa para o crítico.
        if (/d\d+/i.test(critMod)) {
          const critRes = rollDiceExpression(critMod);
          finalTotal = critRes?.total ?? 0;
          const critText = critRes ? formatDiceResult(critRes) : `(dice inválido: "${critMod}")`;
          detailSuffix = `• ${critText}`;
        } else {
          // Caso contrário, aplica operações no total do dano base.
          finalTotal = applyCritOps(baseTotal, critMod);
          detailSuffix = `• ${baseText} ⇒ ${critMod} = ${finalTotal}`;
        }
      } else {
        // padrão: dobra apenas os dados (estilo 5e)
        const critExpr = buildCritExpression(atk.dice, 2);
        const critRes = rollDiceExpression(critExpr || "");
        finalTotal = critRes?.total ?? 0;
        const critText = critRes ? formatDiceResult(critRes) : `(dice inválido: "${critExpr || ""}")`;
        detailSuffix = `• ${critText}`;
      }

      await addDoc(rollsCol(), {
        playerId,
        isSecret: isSecretRoll,
        createdAt: serverTimestamp(),
        type: "Dano",
        subtype: atk.name || "Dano",
        total: finalTotal,
        fromAttackRollId: attackDoc.id,
        detail: `${atk.kind === "spell" ? "Magia" : "Arma"} • (crítico) ${detailSuffix}`,
      });
    }
  }

  async function rollDamage() {
    const atk = attacksAll.find((a) => a.id === selectedAttackId);
    if (!atk) return alert("Selecione uma arma/magia.");

    const diceResult = rollDiceExpression(atk.dice || "");
    const diceText = diceResult ? formatDiceResult(diceResult) : `(dice inválido: "${atk.dice || ""}")`;

    await logRoll({
      type: "Dano",
      subtype: atk.name || "Dano",
      total: diceResult?.total ?? 0,
      detail: `${atk.kind === "spell" ? "Magia" : "Arma"} • ${diceText}`,
    });
  }

  async function rollFree() {
    const diceResult = rollDiceExpression(freeExpr || "");
    if (!diceResult) return alert('Expressão inválida. Ex: "3d4+8"');

    const text = formatDiceResult(diceResult);

    await logRoll({
      type: "Livre",
      subtype: freeExpr.trim() || "Rolagem livre",
      total: diceResult.total,
      detail: text,
    });
  }

  async function handleRoll() {
    if (!player) return;

    if (rollType === "Atributo") return rollAbility();
    if (rollType === "Perícia") return rollSkill();
    if (rollType === "Ataque") return rollAttackToHit();
    if (rollType === "Dano") return rollDamage();
    if (rollType === "Livre") return rollFree();
  }

  if (loading) return <div style={{ padding: 24 }}>Carregando...</div>;
  if (!player || player.hasSetup === false) return <PlayerSetup playerId={playerId} initialPlayer={player} />;

  const displayName = player.displayName || playerId;
  const level = player.level || 1;
  const pb = proficiencyBonus(level);

  const tabs = [
    { key: "stats", label: "Stats" },
    { key: "pericias", label: "Perícias" },
    { key: "ataques", label: "Ataques e Magias" },
    { key: "inventario", label: "Inventário" },
    { key: "notas", label: "Notas" },
  ];

  // NÃO usar hooks depois de returns condicionais (isso quebra no build/prod).
  // Aqui não precisamos de memo: é barato e evita o erro "Rendered fewer hooks than expected".
  const trainedSkills = skillComputed.filter((s) => s.proficient);

  const inventoryItems = Array.isArray(player.inventory) ? player.inventory : [];
  const notes = Array.isArray(player.notes) ? player.notes : [];

  return (
    <div className="player-page">
      <div className="sheet-layout sheet-layout-two">
        <div className="sheet-main">
          <header className="sheet-header ui-card">
            <div className="sheet-header-top">
              <div className="player-name">{displayName}</div>
              <div className="sheet-header-actions">
                <button className="ui-btn ui-btn-ghost" onClick={() => setShowInfo(true)} aria-label="Configurações">
                  ⚙️
                </button>
              </div>
            </div>

          <nav className="sheet-tabs" aria-label="Seções da ficha">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                className={"sheet-tab" + (activeTab === t.key ? " active" : "")}
                onClick={() => setActiveTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </header>

          <main className="sheet-content">
            {activeTab === "stats" && (
              <div className="ui-card">
                <h3 style={{ marginTop: 0 }}>Stats</h3>

                {/* Atributos (somente exibição aqui; edição fica no ⚙️) */}
                <div className="grid-cards" style={{ marginTop: 10 }}>
                  {ABILITIES.map((a) => {
                    const score = player.abilities?.[a.key] ?? 10;
                    const mod = abilityModifier(score);
                    return (
                      <div key={a.key} className="stat-card">
                        <div className="stat-top">
                          <div className="stat-label">{a.short}</div>
                          <div className="stat-score">{score}</div>
                        </div>
                        <div className="stat-mod">
                          {mod >= 0 ? "+" : ""}
                          {mod}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="form-grid" style={{ marginTop: 12 }}>
                  <div className="field">
                    <label className="field-label">Raça</label>
                    <select
                      className="ui-input"
                      value={statsForm.race}
                      onChange={(e) => setStatsForm((s) => ({ ...s, race: e.target.value }))}
                    >
                      <option value="">Selecione…</option>
                      {RACES_5E.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label className="field-label">Classe</label>
                    <select
                      className="ui-input"
                      value={statsForm.className}
                      onChange={(e) => setStatsForm((s) => ({ ...s, className: e.target.value }))}
                    >
                      <option value="">Selecione…</option>
                      {CLASSES_5E.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label className="field-label">Antecedente</label>
                    <input
                      className="ui-input"
                      value={statsForm.background}
                      onChange={(e) => setStatsForm((s) => ({ ...s, background: e.target.value }))}
                      placeholder="Ex: Artista"
                    />
                  </div>

                  <div className="field">
                    <label className="field-label">Alinhamento</label>
                    <select
                      className="ui-input"
                      value={statsForm.alignment}
                      onChange={(e) => setStatsForm((s) => ({ ...s, alignment: e.target.value }))}
                    >
                      <option value="">Selecione…</option>
                      {ALIGNMENTS_5E.map((a) => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label className="field-label">PV Máximo</label>
                    <input
                      className="ui-input"
                      inputMode="numeric"
                      value={statsForm.hpMax}
                      onChange={(e) => setStatsForm((s) => ({ ...s, hpMax: Number(e.target.value || 0) }))}
                    />
                  </div>

                  <div className="field">
                    <label className="field-label">PV Atual</label>
                    <input
                      className="ui-input"
                      inputMode="numeric"
                      value={statsForm.hpCurrent}
                      onChange={(e) => setStatsForm((s) => ({ ...s, hpCurrent: Number(e.target.value || 0) }))}
                    />
                  </div>

                  <div className="field">
                    <label className="field-label">XP</label>
                    <input
                      className="ui-input"
                      inputMode="numeric"
                      value={statsForm.xp}
                      onChange={(e) => setStatsForm((s) => ({ ...s, xp: Number(e.target.value || 0) }))}
                    />
                  </div>

                  <div className="field">
                    <label className="field-label">Nível</label>
                    <input
                      className="ui-input"
                      inputMode="numeric"
                      value={statsForm.level}
                      onChange={(e) => setStatsForm((s) => ({ ...s, level: Math.max(1, Number(e.target.value || 1)) }))}
                    />
                  </div>

                  <div className="field">
                    <label className="field-label">Bônus de Proficiência</label>
                    <input className="ui-input" value={`+${proficiencyBonus(statsForm.level)}`} readOnly />
                  </div>
                </div>

                <div className="controls-footer" style={{ marginTop: 6 }}>
                  <button
                    className="ui-btn ui-btn-primary"
                    onClick={async () => {
                      await mergePlayer({
                        race: statsForm.race,
                        className: statsForm.className,
                        background: statsForm.background,
                        alignment: statsForm.alignment,
                        hpMax: Number(statsForm.hpMax || 0),
                        hpCurrent: Number(statsForm.hpCurrent || 0),
                        xp: Number(statsForm.xp || 0),
                        level: Number(statsForm.level || 1),
                      });
                    }}
                  >
                    Salvar
                  </button>
                  <div className="ui-muted" style={{ fontSize: 12 }}>
                    (Atributos e perícias você ajusta no ⚙️)
                  </div>
                </div>
              </div>
            )}

            {activeTab === "pericias" && (
              <div className="ui-card">
                <h3 style={{ marginTop: 0 }}>Perícias</h3>

                {trainedSkills.length === 0 ? (
                  <div className="ui-muted">Nenhuma perícia treinada marcada no ⚙️ ainda.</div>
                ) : (
                  <div className="list-cards">
                    {trainedSkills.map((s) => (
                      <div key={s.key} className="row-card row-card-actions">
                        <button
                          type="button"
                          className="row-link"
                          onClick={() => setSkillInfoKey(s.key)}
                          aria-label={`Ver descrição de ${s.label}`}
                        >
                          <div className="row-title">{s.label}</div>
                          <div className="ui-muted" style={{ fontSize: 12 }}>
                            Treinada • +PB({pb})
                            {s.extra ? ` • bônus ${s.extra >= 0 ? "+" : ""}${s.extra}` : ""}
                          </div>
                        </button>

                        <div className="row-right">
                          <div className="row-pill">{s.totalBonus >= 0 ? "+" : ""}{s.totalBonus}</div>
                          <button
                            type="button"
                            className="mini-btn"
                            onClick={async () => {
                              await rollSkillQuick(s.key);
                            }}
                          >
                            ROLAR
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === "ataques" && (
              <div className="ui-card">
                <div className="section-row">
                  <h3 style={{ margin: 0 }}>Ataques e Magias</h3>
                  <button className="icon-plus" type="button" onClick={() => setShowAddAction(true)} aria-label="Adicionar">
                    +
                  </button>
                </div>

                {attacksAll.length === 0 ? (
                  <div className="ui-muted">Ainda não tem nada cadastrado. Toque no + para adicionar.</div>
                ) : (
                  <div className="list-cards">
                    {attacksAll.map((atk) => (
                      <div key={atk.id} className="row-card row-card-actions">
                        <div>
                          <div className="row-title">{atk.name || atk.description?.slice(0, 32) || "Sem nome"}</div>
                          <div className="ui-muted" style={{ fontSize: 12 }}>
                            {atk.kind === "spell" ? "Magia" : "Ataque"} • dano: {atk.dice || "—"}
                          </div>
                        </div>
                        <div className="row-right">
                          <button
                            type="button"
                            className="mini-btn"
                            onClick={() => {
                              setRollType("Ataque");
                              setSelectedAttackId(atk.id);
                              setShowRoller(true);
                            }}
                          >
                            Ataque
                          </button>
                          <button
                            type="button"
                            className="mini-btn"
                            onClick={() => {
                              setRollType("Dano");
                              setSelectedAttackId(atk.id);
                              setShowRoller(true);
                            }}
                          >
                            Dano
                          </button>
                          <button
                            type="button"
                            className="mini-btn mini-btn-ghost"
                            onClick={async () => {
                              const next = attacksAll.filter((a) => a.id !== atk.id);
                              await mergePlayer({ attacks: next });
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === "inventario" && (
              <div className="ui-card">
                <div className="section-row">
                  <h3 style={{ margin: 0 }}>Inventário</h3>
                  <button className="icon-plus" type="button" onClick={() => setShowAddItem(true)} aria-label="Adicionar item">
                    +
                  </button>
                </div>

                <div className="currency-row">
                  <div className="field">
                    <label className="field-label">Bronze</label>
                    <input
                      className="ui-input"
                      inputMode="numeric"
                      value={currencyForm.bronze}
                      onChange={(e) => setCurrencyForm((c) => ({ ...c, bronze: Number(e.target.value || 0) }))}
                    />
                  </div>
                  <div className="field">
                    <label className="field-label">Prata</label>
                    <input
                      className="ui-input"
                      inputMode="numeric"
                      value={currencyForm.prata}
                      onChange={(e) => setCurrencyForm((c) => ({ ...c, prata: Number(e.target.value || 0) }))}
                    />
                  </div>
                  <div className="field">
                    <label className="field-label">Ouro</label>
                    <input
                      className="ui-input"
                      inputMode="numeric"
                      value={currencyForm.ouro}
                      onChange={(e) => setCurrencyForm((c) => ({ ...c, ouro: Number(e.target.value || 0) }))}
                    />
                  </div>
                </div>

                <div className="controls-footer" style={{ marginTop: 6 }}>
                  <button
                    className="ui-btn ui-btn-primary"
                    onClick={async () => {
                      await mergePlayer({ currency: { ...currencyForm } });
                    }}
                  >
                    Salvar moedas
                  </button>
                </div>

                <div style={{ marginTop: 12 }}>
                  {inventoryItems.length === 0 ? (
                    <div className="ui-muted">Nenhum item ainda. Toque no + para adicionar.</div>
                  ) : (
                    <div className="list-cards">
                      {inventoryItems.map((it) => (
                        <div key={it.id} className="row-card row-card-actions">
                          <div>
                            <div className="row-title">{it.name || "(sem nome)"}</div>
                            <div className="ui-muted" style={{ fontSize: 12 }}>
                              {it.weight ? `Peso: ${it.weight}` : ""}
                            </div>
                            {it.description ? <div className="ui-muted" style={{ fontSize: 12, marginTop: 6 }}>{it.description}</div> : null}
                          </div>
                          <div className="row-right">
                            <button
                              type="button"
                              className="mini-btn mini-btn-ghost"
                              onClick={async () => {
                                const next = inventoryItems.filter((x) => x.id !== it.id);
                                await mergePlayer({ inventory: next });
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === "notas" && (
              <div className="ui-card">
                <div className="section-row">
                  <h3 style={{ margin: 0 }}>Notas</h3>
                  <button className="icon-plus" type="button" onClick={() => setShowAddNote(true)} aria-label="Adicionar nota">
                    +
                  </button>
                </div>

                {notes.length === 0 ? (
                  <div className="ui-muted">Nenhum registro ainda. Toque no + para criar o da sessão.</div>
                ) : (
                  <div className="list-cards">
                    {[...notes]
                      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
                      .map((n) => (
                        <div key={n.id} className="row-card row-card-actions">
                          <div>
                            <div className="row-title">{n.date || "(sem data)"}</div>
                            <div className="ui-muted" style={{ fontSize: 12, whiteSpace: "pre-wrap", marginTop: 6 }}>
                              {n.text || ""}
                            </div>
                          </div>
                          <div className="row-right">
                            <button
                              type="button"
                              className="mini-btn mini-btn-ghost"
                              onClick={async () => {
                                const next = notes.filter((x) => x.id !== n.id);
                                await mergePlayer({ notes: next });
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}
          </main>

          <button className="fab-roll" type="button" onClick={() => setShowRoller(true)} aria-label="Abrir rolador">
          🎲
          </button>

          <Drawer open={showRoller} title="Rolador" onClose={() => setShowRoller(false)}>
          <div className="ui-card" style={{ boxShadow: "none" }}>
            <div className="toggle-row" style={{ marginBottom: 10 }}>
              <button
                type="button"
                className={"toggle-btn" + (isSecretRoll ? " active" : "")}
                onClick={() => setIsSecretRoll((v) => !v)}
              >
                Secreta
              </button>
              <button
                type="button"
                className={"toggle-btn" + (isAdvantage ? " active" : "")}
                onClick={() => {
                  setIsAdvantage((v) => !v);
                  setIsDisadvantage(false);
                }}
              >
                Vantagem
              </button>
              <button
                type="button"
                className={"toggle-btn" + (isDisadvantage ? " active" : "")}
                onClick={() => {
                  setIsDisadvantage((v) => !v);
                  setIsAdvantage(false);
                }}
              >
                Desvantagem
              </button>
            </div>

            <div className="field">
              <label className="field-label">Tipo</label>
              <select className="ui-select" value={rollType} onChange={(e) => setRollType(e.target.value)}>
                <option value="Atributo">Atributo</option>
                <option value="Perícia">Perícia</option>
                <option value="Ataque">Ataque</option>
                <option value="Dano">Dano</option>
                <option value="Livre">Livre</option>
              </select>
            </div>

            {rollType === "Atributo" && (
              <div className="field">
                <label className="field-label">Atributo</label>
                <select className="ui-select" value={selectedAbility} onChange={(e) => setSelectedAbility(e.target.value)}>
                  {ABILITIES.map((a) => (
                    <option key={a.key} value={a.key}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {rollType === "Perícia" && (
              <div className="field">
                <label className="field-label">Perícia</label>
                <select className="ui-select" value={selectedSkill} onChange={(e) => setSelectedSkill(e.target.value)}>
                  {SKILLS.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {(rollType === "Ataque" || rollType === "Dano") && (
              <div className="field">
                <label className="field-label">{rollType}</label>
                <select className="ui-select" value={selectedAttackId} onChange={(e) => setSelectedAttackId(e.target.value)}>
                  {(rollType === "Ataque" ? attacksForAttackRoll : attacksAll).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name || "Sem nome"} • {a.kind === "spell" ? "Magia" : "Arma"}
                    </option>
                  ))}
                </select>
                {rollType === "Ataque" && attacksAll.some((a) => a.kind === "spell" && a.hasAttackRoll === false) ? (
                  <div className="ui-muted" style={{ fontSize: 12, marginTop: 6 }}>
                    (magias “sem teste de ataque” não aparecem aqui)
                  </div>
                ) : null}
              </div>
            )}

            {rollType === "Livre" && (
              <div className="field">
                <label className="field-label">Expressão</label>
                <input className="ui-input" value={freeExpr} onChange={(e) => setFreeExpr(e.target.value)} placeholder='ex: 3d4+8' />
              </div>
            )}

            <div className="controls-footer">
              <button
                className="ui-btn ui-btn-primary"
                onClick={async () => {
                  await handleRoll();
                  setShowRoller(false);
                }}
              >
                ROLAR
              </button>
            </div>
          </div>
          </Drawer>

          <Modal open={showInfo} title="Configurações" onClose={() => setShowInfo(false)}>
            <PlayerInfoForm playerId={playerId} player={player} onDone={() => setShowInfo(false)} />
          </Modal>

          {/* Modal de descrição de perícia */}
          <Modal
            open={!!skillInfoKey}
            title={skillInfoKey ? SKILLS.find((s) => s.key === skillInfoKey)?.label || "Perícia" : "Perícia"}
            onClose={() => setSkillInfoKey(null)}
          >
            <div className="ui-muted" style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
              {skillInfoKey ? SKILL_DESCRIPTIONS[skillInfoKey] || "(sem descrição cadastrada)" : ""}
            </div>
          </Modal>

          {/* Modal de adicionar ataque/magia */}
          <Modal open={showAddAction} title="Adicionar" onClose={() => setShowAddAction(false)}>
            <div style={{ display: "grid", gap: 10 }}>
              <div className="field">
                <label className="field-label">Tipo</label>
                <select
                  className="ui-select"
                  value={newAction.type}
                  onChange={(e) => {
                    const t = e.target.value;
                    setNewAction((a) => ({ ...a, type: t, hasAttackRoll: t === "Magia" ? a.hasAttackRoll : true }));
                  }}
                >
                  <option value="Ataque">Ataque</option>
                  <option value="Magia">Magia</option>
                </select>
              </div>

              <div className="field">
                <label className="field-label">Nome (opcional)</label>
                <input className="ui-input" value={newAction.name} onChange={(e) => setNewAction((a) => ({ ...a, name: e.target.value }))} placeholder='Ex: "Adaga"' />
              </div>

              <div className="field">
                <label className="field-label">Descrição</label>
                <textarea
                  className="ui-textarea"
                  value={newAction.description}
                  onChange={(e) => setNewAction((a) => ({ ...a, description: e.target.value }))}
                  placeholder="Cole aqui a descrição"
                  rows={5}
                />
              </div>

              <div className="field">
                <label className="field-label">Dano (expressão)</label>
                <input className="ui-input" value={newAction.dice} onChange={(e) => setNewAction((a) => ({ ...a, dice: e.target.value }))} placeholder='Ex: "2d8+3"' />
                <div className="ui-muted" style={{ fontSize: 12, marginTop: 6 }}>
                  Mesma lógica da rolagem livre.
                </div>
              </div>

              <div className="field">
                <label className="field-label">Crítico (modificador)</label>
                <input
                  className="ui-input"
                  value={newAction.crit}
                  onChange={(e) => setNewAction((a) => ({ ...a, crit: e.target.value }))}
                  placeholder='Ex: "x2 + 3" ou "+2 x3" (opcional)'
                />
                <div className="ui-muted" style={{ fontSize: 12, marginTop: 6 }}>
                  Se vazio, dobra apenas os dados automaticamente. Se você escrever uma expressão com "d" (ex: "4d8+3"), ela substitui o dano no crítico.
                </div>
              </div>

              <div className="field">
                <label className="field-label">Acerto crítico (no dado)</label>
                <input
                  className="ui-input"
                  inputMode="numeric"
                  value={newAction.critOn}
                  onChange={(e) => setNewAction((a) => ({ ...a, critOn: e.target.value }))}
                  placeholder='Ex: "18" (18–20 crita)'
                />
                <div className="ui-muted" style={{ fontSize: 12, marginTop: 6 }}>
                  Se preenchido, qualquer d20 com esse valor ou maior também vira crítico (além do 20 natural).
                </div>
              </div>


              <div className="field">
                <label className="field-label">Atributo base (para teste de ataque)</label>
                <select className="ui-select" value={newAction.ability} onChange={(e) => setNewAction((a) => ({ ...a, ability: e.target.value }))}>
                  <option value="str">Força</option>
                  <option value="dex">Destreza</option>
                  <option value="none">Nenhum</option>
                </select>
              </div>

              <div className="field">
                <label className="field-label">Bônus adicional (opcional)</label>
                <input
                  className="ui-input"
                  inputMode="numeric"
                  value={newAction.bonusAdditional}
                  onChange={(e) => setNewAction((a) => ({ ...a, bonusAdditional: Number(e.target.value || 0) }))}
                />
              </div>

              {newAction.type === "Magia" ? (
                <label style={{ display: "flex", alignItems: "center", gap: 10, opacity: 0.92 }}>
                  <input
                    type="checkbox"
                    checked={newAction.hasAttackRoll === false}
                    onChange={(e) => setNewAction((a) => ({ ...a, hasAttackRoll: !e.target.checked }))}
                  />
                  Sem teste de ataque (acerta automaticamente)
                </label>
              ) : null}

              <div className="controls-footer">
                <button
                  className="ui-btn ui-btn-primary"
                  onClick={async () => {
                    const entry = {
                      id: nanoid(),
                      name: newAction.name?.trim() || "",
                      description: newAction.description || "",
                      kind: newAction.type === "Magia" ? "spell" : "weapon",
                      dice: newAction.dice || "",
                      crit: newAction.crit || "",
                      critOn: newAction.critOn ? Number(newAction.critOn) : undefined,
                      ability: newAction.ability || "str",
                      bonusAdditional: Number(newAction.bonusAdditional || 0),
                      hasAttackRoll: newAction.type === "Magia" ? newAction.hasAttackRoll : true,
                    };
                    const next = [...attacksAll, entry];
                    await mergePlayer({ attacks: next });
                    setShowAddAction(false);
                    setNewAction({ type: "Ataque", name: "", description: "", dice: "", crit: "", critOn: "", ability: "str", bonusAdditional: 0, hasAttackRoll: true });
                  }}
                >
                  Adicionar
                </button>
              </div>
            </div>
          </Modal>

          {/* Modal de adicionar item */}
          <Modal open={showAddItem} title="Adicionar item" onClose={() => setShowAddItem(false)}>
            <div style={{ display: "grid", gap: 10 }}>
              <div className="field">
                <label className="field-label">Nome</label>
                <input className="ui-input" value={newItem.name} onChange={(e) => setNewItem((i) => ({ ...i, name: e.target.value }))} />
              </div>
              <div className="field">
                <label className="field-label">Descrição</label>
                <textarea className="ui-textarea" rows={4} value={newItem.description} onChange={(e) => setNewItem((i) => ({ ...i, description: e.target.value }))} />
              </div>
              <div className="field">
                <label className="field-label">Peso</label>
                <input className="ui-input" value={newItem.weight} onChange={(e) => setNewItem((i) => ({ ...i, weight: e.target.value }))} placeholder="Ex: 1,5" />
              </div>
              <div className="controls-footer">
                <button
                  className="ui-btn ui-btn-primary"
                  onClick={async () => {
                    const entry = { id: nanoid(), name: newItem.name || "", description: newItem.description || "", weight: newItem.weight || "" };
                    await mergePlayer({ inventory: [...inventoryItems, entry] });
                    setShowAddItem(false);
                    setNewItem({ name: "", description: "", weight: "" });
                  }}
                >
                  Adicionar
                </button>
              </div>
            </div>
          </Modal>

          {/* Modal de adicionar nota */}
          <Modal open={showAddNote} title="Novo registro" onClose={() => setShowAddNote(false)}>
            <div style={{ display: "grid", gap: 10 }}>
              <div className="field">
                <label className="field-label">Data</label>
                <input type="date" className="ui-input" value={newNote.date} onChange={(e) => setNewNote((n) => ({ ...n, date: e.target.value }))} />
              </div>
              <div className="field">
                <label className="field-label">Notas da sessão</label>
                <textarea
                  className="ui-textarea"
                  rows={10}
                  value={newNote.text}
                  onChange={(e) => setNewNote((n) => ({ ...n, text: e.target.value }))}
                  placeholder="O que aconteceu?"
                />
              </div>
              <div className="controls-footer">
                <button
                  className="ui-btn ui-btn-primary"
                  onClick={async () => {
                    const entry = { id: nanoid(), date: newNote.date, text: newNote.text || "" };
                    await mergePlayer({ notes: [...notes, entry] });
                    setShowAddNote(false);
                    setNewNote({ date: new Date().toISOString().slice(0, 10), text: "" });
                  }}
                >
                  Salvar
                </button>
              </div>
            </div>
          </Modal>
        </div>

        {/* Painel lateral (rolagens da mesa) */}
        <aside className="sheet-side">
          <LiveFeed viewerId={playerId} isMaster={false} title="Rolagens (mesa)" maxItems={15} ttlMinutes={30} />
        </aside>
      </div>
    </div>
  );
}
