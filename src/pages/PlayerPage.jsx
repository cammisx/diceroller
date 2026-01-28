import { useParams } from "react-router-dom";
import { addDoc, serverTimestamp } from "firebase/firestore";
import { rollsCol } from "../lib/refs";
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

export default function PlayerPage() {
  const { playerId } = useParams();
  const { player, loading } = usePlayer(playerId);

  const [showInfo, setShowInfo] = useState(false);
  const [showRoller, setShowRoller] = useState(false);
  const [activeTab, setActiveTab] = useState("atributos");

  const [isSecretRoll, setIsSecretRoll] = useState(false);
  const [isAdvantage, setIsAdvantage] = useState(false);
  const [isDisadvantage, setIsDisadvantage] = useState(false);

  const [rollType, setRollType] = useState("Atributo");
  const [selectedAbility, setSelectedAbility] = useState("str");
  const [selectedSkill, setSelectedSkill] = useState("perception");
  const [selectedAttackId, setSelectedAttackId] = useState("");
  const [freeExpr, setFreeExpr] = useState("");

  useEffect(() => {
    const themeName = player?.preferences?.theme || "Neon Tokyo";
    applyThemeVars(getTheme(themeName));
  }, [player?.preferences?.theme]);

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

  async function rollAttackToHit() {
    const atk = attacksForAttackRoll.find((a) => a.id === selectedAttackId);
    if (!atk) return alert("Selecione um ataque.");

    const abilityKey = atk.ability || "str";
    const score = player.abilities?.[abilityKey] ?? 10;
    const mod = abilityModifier(score);

    const bonusAdditional = Number(atk.bonusAdditional || 0);
    const pb = proficiencyBonus(player.level);

    const d20res = rollD20WithState();
    const total = d20res.d20 + mod + pb + bonusAdditional;

    await logRoll({
      type: "Ataque",
      subtype: atk.name || "Ataque",
      total,
      detail: `${d20res.detail} ${mod >= 0 ? "+" : ""}${mod} +PB(${pb})${
        bonusAdditional ? ` ${bonusAdditional >= 0 ? "+" : ""}${bonusAdditional}` : ""
      } = ${total} • ${atk.kind === "spell" ? "Magia" : "Arma"}`,
    });
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
    { key: "atributos", label: "Atributos" },
    { key: "pericias", label: "Perícias" },
    { key: "ataques", label: "Ataques" },
    { key: "inventario", label: "Inventário" },
    { key: "notas", label: "Notas" },
    { key: "rolagens", label: "Rolagens" },
  ];

  return (
    <div className="player-page">
      <div className="sheet-layout">
        <header className="sheet-header ui-card">
          <div className="sheet-header-top">
            <div>
              <div className="player-name">{displayName}</div>
              <div className="player-subline">
                <span className="ui-muted">PB:</span> <strong>+{pb}</strong>
              </div>
            </div>
            <div className="sheet-header-actions">
              <div className="player-badge">
                <ShieldLevel level={level} />
              </div>
              <button className="ui-btn ui-btn-ghost" onClick={() => setShowInfo(true)}>
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
          {activeTab === "atributos" && (
            <div className="ui-card">
              <h3 style={{ marginTop: 0 }}>Atributos</h3>
              <div className="grid-cards">
                {ABILITIES.map((a) => {
                  const score = player.abilities?.[a.key] ?? 10;
                  const mod = abilityModifier(score);
                  return (
                    <div key={a.key} className="stat-card">
                      <div className="stat-top">
                        <div className="stat-label">{a.short}</div>
                        <div className="stat-score">{score}</div>
                      </div>
                      <div className="stat-mod">{mod >= 0 ? "+" : ""}{mod}</div>
                    </div>
                  );
                })}
              </div>
              <div className="ui-muted" style={{ marginTop: 10, fontSize: 13 }}>
                Dica: toque no 🎲 para abrir o rolador.
              </div>
            </div>
          )}

          {activeTab === "pericias" && (
            <div className="ui-card">
              <h3 style={{ marginTop: 0 }}>Perícias</h3>
              <div className="list-cards">
                {skillComputed.map((s) => (
                  <div key={s.key} className="row-card">
                    <div>
                      <div className="row-title">{s.label}</div>
                      <div className="ui-muted" style={{ fontSize: 12 }}>
                        {s.proficient ? `Treinada • +PB(${pb})` : "Não treinada"}
                        {s.extra ? ` • bônus ${s.extra >= 0 ? "+" : ""}${s.extra}` : ""}
                      </div>
                    </div>
                    <div className="row-pill">{s.totalBonus >= 0 ? "+" : ""}{s.totalBonus}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "ataques" && (
            <div className="ui-card">
              <h3 style={{ marginTop: 0 }}>Ataques</h3>
              {attacksAll.length === 0 ? (
                <div className="ui-muted">Nenhum ataque cadastrado. Abra ⚙️ para adicionar.</div>
              ) : (
                <div className="list-cards">
                  {attacksAll.map((atk) => (
                    <div key={atk.id} className="row-card">
                      <div>
                        <div className="row-title">{atk.name || "Sem nome"}</div>
                        <div className="ui-muted" style={{ fontSize: 12 }}>
                          {atk.kind === "spell" ? "Magia" : "Arma"} • dano: {atk.dice || "—"}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="mini-btn"
                        onClick={() => {
                          setRollType("Ataque");
                          setSelectedAttackId(atk.id);
                          setShowRoller(true);
                        }}
                      >
                        Rolar
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "inventario" && (
            <div className="ui-card">
              <h3 style={{ marginTop: 0 }}>Inventário</h3>
              <div className="ui-muted">A gente monta essa aba agora que a ficha virou completa ✨</div>
            </div>
          )}

          {activeTab === "notas" && (
            <div className="ui-card">
              <h3 style={{ marginTop: 0 }}>Notas</h3>
              <div className="ui-muted">Em breve: condições, traços e anotações rápidas.</div>
            </div>
          )}

          {activeTab === "rolagens" && (
            <div className="ui-card livefeed-card">
              <LiveFeed viewerId={playerId} isMaster={false} title="Rolagens (mesa)" />
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
                  setActiveTab("rolagens");
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
      </div>
    </div>
  );
}
