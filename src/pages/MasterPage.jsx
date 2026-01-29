import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { nanoid } from "nanoid";
import { playersCol, playerRef, npcsCol, npcRef, rollsCol, tableRef } from "../lib/refs";
import { rollDiceExpression, formatDiceResult } from "../lib/dice";
import LiveFeed from "../components/LiveFeed.jsx";
import Drawer from "../components/Drawer.jsx";
import Modal from "../components/Modal.jsx";
import ThemePicker from "../components/ThemePicker.jsx";
import { getTheme } from "../theme/themes";
import { applyThemeVars } from "../theme/applyTheme";

function slugify(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "");
}

function clampNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeConditions(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean).map((s) => String(s).trim()).filter(Boolean);
  return String(value)
    .split(/[;,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function ConditionsTags({ value, onChange, placeholder = "Adicionar..." }) {
  const [draft, setDraft] = useState("");
  const tags = normalizeConditions(value);

  function commitTag(raw) {
    const t = String(raw || "").trim();
    if (!t) return;
    if (tags.some((x) => x.toLowerCase() === t.toLowerCase())) return;
    onChange([...tags, t]);
    setDraft("");
  }

  function removeAt(i) {
    const next = tags.slice();
    next.splice(i, 1);
    onChange(next);
  }

  return (
    <div className="cond-tags">
      <div className="cond-chips">
        {tags.map((t, i) => (
          <span key={t + i} className="cond-chip">
            {t}
            <button type="button" className="cond-chip-x" onClick={() => removeAt(i)} aria-label="Remover condição">
              ✕
            </button>
          </span>
        ))}
      </div>

      <input
        className="ui-input cond-input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "," || e.key === ";") {
            e.preventDefault();
            commitTag(draft);
          }
          if (e.key === "Backspace" && !draft && tags.length) {
            e.preventDefault();
            removeAt(tags.length - 1);
          }
        }}
        onBlur={() => commitTag(draft)}
      />
    </div>
  );
}

export default function MasterPage() {
  const [activeTab, setActiveTab] = useState("jogadores");

  const [name, setName] = useState("");
  const [players, setPlayers] = useState([]);

  const [npcs, setNpcs] = useState([]);
  const [npcModalOpen, setNpcModalOpen] = useState(false);
  const [npcForm, setNpcForm] = useState({
    name: "",
    scene: "",
    hpMax: 0,
    hpCurrent: 0,
    armorClass: 10,
    initMod: 0,
    notes: "",
  });

  const [combatScene, setCombatScene] = useState("");

  const [combatAddOpen, setCombatAddOpen] = useState(false);
  const [npcToAddId, setNpcToAddId] = useState("");
  const [combatState, setCombatState] = useState({}); // map: key -> { initiative, conditions }
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rollerOpen, setRollerOpen] = useState(false);
  const [rollerExpr, setRollerExpr] = useState("");
  const [rollerSecret, setRollerSecret] = useState(true);
  const [rollerAdv, setRollerAdv] = useState(false);
  const [rollerDis, setRollerDis] = useState(false);
  const [lastSecretResult, setLastSecretResult] = useState("");

  const [tableData, setTableData] = useState(null);

  const baseUrl = useMemo(() => window.location.origin, []);

  // table preferences + combat state
  useEffect(() => {
    return onSnapshot(tableRef(), (snap) => {
      const d = snap.data() || {};
      setTableData({ id: snap.id, ...d });
      setCombatState(d.combatState || {});
      const themeName = d?.preferences?.theme || "Neon Tokyo";
      applyThemeVars(getTheme(themeName));
    });
  }, []);

  // players ao vivo
  useEffect(() => {
    const q = query(playersCol(), orderBy("createdAt", "desc"));
    return onSnapshot(q, (snap) => {
      setPlayers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, []);

  // npcs ao vivo
  useEffect(() => {
    const q = query(npcsCol(), orderBy("createdAt", "desc"));
    return onSnapshot(q, (snap) => {
      setNpcs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, []);

  async function createPlayer() {
    const playerId = slugify(name);
    if (!playerId) return alert('Digite um nome (ex: "chloe").');

    await setDoc(
      playerRef(playerId),
      {
        playerId,
        displayName: name.trim(),
        hasSetup: false,

        level: 1,
        race: "",
        className: "",
        background: "",
        alignment: "",
        hpMax: 0,
        hpCurrent: 0,
        xp: 0,
        abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
        skills: {},
        attacks: [],
        currency: { bronze: 0, prata: 0, ouro: 0 },
        inventory: [],
        notes: [],

        preferences: {
          theme: "Neon Tokyo",
          showBonus: true,
          showCA: true,
          showSecret: true,
        },

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    setName("");
  }

  async function deletePlayerById(playerId) {
    const ok = window.confirm(`Apagar o jogador "${playerId}"?`);
    if (!ok) return;
    await deleteDoc(playerRef(playerId));
  }

  async function saveNpc() {
    const payload = {
      name: npcForm.name.trim(),
      scene: npcForm.scene.trim(),
      hpMax: clampNum(npcForm.hpMax),
      hpCurrent: clampNum(npcForm.hpCurrent),
      armorClass: clampNum(npcForm.armorClass, 10),
      initMod: clampNum(npcForm.initMod),
      notes: npcForm.notes || "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (!payload.name) return alert("NPC precisa de Nome.");

    const id = slugify(payload.name) + "-" + nanoid(4);
    await setDoc(npcRef(id), payload, { merge: true });

    setNpcModalOpen(false);
    setNpcForm({ name: "", scene: "", hpMax: 0, hpCurrent: 0, armorClass: 10, initMod: 0, notes: "" });
  }

  async function deleteNpcById(id) {
    const ok = window.confirm("Apagar esse NPC?");
    if (!ok) return;
    await deleteDoc(npcRef(id));
    // limpa combatState local (opcional)
    const next = { ...(tableData?.combatState || combatState) };
    delete next[`n:${id}`];
    await setDoc(tableRef(), { combatState: next }, { merge: true });
  }

  async function updateCombatState(nextState) {
    setCombatState(nextState);
    await setDoc(tableRef(), { combatState: nextState }, { merge: true });
  }

  async function includeNpcInCombat(npcId) {
    if (!npcId) return;
    const key = `n:${npcId}`;
    const next = { ...(combatState || {}) };
    next[key] = { ...(next[key] || {}), included: true, excluded: false };
    await updateCombatState(next);
  }

  async function excludeNpcFromCombat(npcId) {
    const key = `n:${npcId}`;
    const next = { ...(combatState || {}) };
    next[key] = { ...(next[key] || {}), excluded: true, included: false };
    await updateCombatState(next);
  }

  const sceneOptions = useMemo(() => {
    const set = new Set();
    for (const n of npcs) {
      const s = String(n.scene || "").trim();
      if (s) set.add(s);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [npcs]);

  const combatRows = useMemo(() => {
    const scene = String(combatScene || "").trim();

    const playerRows = players.map((p) => ({
      kind: "player",
      key: `p:${p.id}`,
      id: p.id,
      name: p.displayName || p.id,
      hpMax: clampNum(p.hpMax),
      hpCurrent: clampNum(p.hpCurrent),
      initMod: clampNum(p.initiativeMod || 0),
    }));

    const sceneNpcs = scene ? npcs.filter((n) => String(n.scene || "").trim() === scene) : [];

    // NPCs adicionados manualmente ao combate (mesmo fora da cena filtrada)
    const manualNpcIds = Object.keys(combatState || {})
      .filter((k) => k.startsWith("n:") && combatState?.[k]?.included)
      .map((k) => k.slice(2));

    const manualNpcs = manualNpcIds
      .map((id) => npcs.find((n) => n.id === id))
      .filter(Boolean);

    // União (sem duplicar) + respeita exclusões
    const npcMap = new Map();
    for (const n of [...sceneNpcs, ...manualNpcs]) npcMap.set(n.id, n);

    const npcRows = Array.from(npcMap.values())
      .filter((n) => !combatState?.[`n:${n.id}`]?.excluded)
      .map((n) => ({
        kind: "npc",
        key: `n:${n.id}`,
        id: n.id,
        name: n.name || n.id,
        hpMax: clampNum(n.hpMax),
        hpCurrent: clampNum(n.hpCurrent),
        initMod: clampNum(n.initMod),
      }));

    const merged = [...playerRows, ...npcRows].map((r) => ({
      ...r,
      initiative: clampNum(combatState?.[r.key]?.initiative, 0),
      conditions: combatState?.[r.key]?.conditions || [],
    }));

    merged.sort((a, b) => (b.initiative || 0) - (a.initiative || 0));
    return merged;
  }, [players, npcs, combatScene, combatState]);

  async function rollNpcInitiative() {
    const npcRows = combatRows.filter((r) => r.kind === "npc");
    if (!npcRows.length) return alert("Não há NPCs no combate para rolar iniciativa.");

    const next = { ...(combatState || {}) };
    for (const r of npcRows) {
      const d20 = Math.floor(Math.random() * 20) + 1;
      const total = d20 + clampNum(r.initMod);
      next[r.key] = { ...(next[r.key] || {}), initiative: total };
    }
    await updateCombatState(next);
  }

function rollD20WithMasterState() {
  if (!rollerAdv && !rollerDis) {
    const d20 = Math.floor(Math.random() * 20) + 1;
    return { d20, detail: `d20(${d20})` };
  }
  const a = Math.floor(Math.random() * 20) + 1;
  const b = Math.floor(Math.random() * 20) + 1;
  const chosen = rollerAdv ? Math.max(a, b) : Math.min(a, b);
  const mode = rollerAdv ? "vantagem" : "desvantagem";
  return { d20: chosen, detail: `2d20(${a}, ${b}) → ${chosen} (${mode})` };
}

async function sendMasterRoll() {
  const raw = (rollerExpr || "").trim();
  const expr = raw || "1d20";

  // Vantagem/Desvantagem: suporta d20 (+/- mod)
  const compact = expr.replace(/\s+/g, "");
  const d20Match = compact.match(/^([0-9]*)d20([+-]\d+)?$/i);
  if ((rollerAdv || rollerDis) && d20Match) {
    const mod = d20Match[2] ? Number(d20Match[2]) : 0;
    const { d20, detail } = rollD20WithMasterState();
    const total = d20 + mod;

    const detailStr = mod
      ? `${detail} ${mod >= 0 ? "+" : "-"} ${Math.abs(mod)} = ${total}`
      : `${detail} = ${total}`;

    if (rollerSecret) {
      setLastSecretResult(detailStr);
      return;
    }

    await addDoc(rollsCol(), {
      createdAt: serverTimestamp(),
      playerId: "mestre",
      isSecret: false,
      type: "Livre",
      subtype: "Livre",
      total,
      detail: detailStr,
    });

    setRollerExpr("");
    setLastSecretResult("");
    return;
  }

  const result = rollDiceExpression(expr);
  if (!result) {
    alert(`Expressão inválida: "${expr}"`);
    return;
  }


  if (rollerSecret) {
    setLastSecretResult(formatDiceResult(result));
    return;
  }

  await addDoc(rollsCol(), {
    createdAt: serverTimestamp(),
    playerId: "mestre",
    isSecret: false,
    type: "Livre",
    subtype: "Livre",
    total: result.total,
    detail: formatDiceResult(result),
  });

  setRollerExpr("");
  setLastSecretResult("");
}

  return (
    <div className="player-page">
      <div className="sheet-layout sheet-layout-two">
        <div className="sheet-main">
          <header className="sheet-header ui-card">
            <div className="sheet-header-top">
              <div className="player-name">Mestre</div>
              <div className="sheet-header-actions">
                <button className="ui-btn ui-btn-ghost" onClick={() => setSettingsOpen(true)} aria-label="Configurações">
                  ⚙️
                </button>
              </div>
            </div>

            <nav className="sheet-tabs" aria-label="Seções do mestre">
              {[
                { key: "jogadores", label: "Jogadores" },
                { key: "npcs", label: "NPCs" },
                { key: "combate", label: "Combate" },
              ].map((t) => (
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

          <main className="sheet-content" style={{ paddingBottom: 90 }}>
            {activeTab === "jogadores" && (
              <div className="ui-card">
                <h3 style={{ marginTop: 0 }}>Jogadores</h3>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <input
                    className="ui-input"
                    placeholder='Nome do jogador (ex: "Chloë")'
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    style={{ flex: "1 1 220px" }}
                  />
                  <button className="ui-btn ui-btn-primary" onClick={createPlayer} style={{ flex: "0 0 auto" }}>
                    + Criar
                  </button>
                </div>

                <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                  {players.map((p) => {
                    const url = `${baseUrl}/${p.id}`;
                    return (
                      <div
                        key={p.id}
                        className="list-row clickable"
                        role="button"
                        tabIndex={0}
                        onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") window.open(url, "_blank", "noopener,noreferrer");
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 900 }}>{p.displayName || p.id}</div>
                          <div className="muted" style={{ fontSize: 12, wordBreak: "break-all" }}>
                            {url}
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            className="ui-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(url);
                            }}
                            title="Copiar link"
                          >
                            📋
                          </button>
                          <button
                            className="ui-btn ui-btn-danger"
                            onClick={(e) => {
                              e.stopPropagation();
                              deletePlayerById(p.id);
                            }}
                            title="Apagar"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {!players.length && <div className="muted">Nenhum jogador cadastrado ainda.</div>}
                </div>
              </div>
            )}

            {activeTab === "npcs" && (
              <div className="ui-card">
                <div className="combat-header">
                  <h3 style={{ marginTop: 0, marginBottom: 0 }}>NPCs</h3>
                  <button className="ui-btn ui-btn-primary" onClick={() => setNpcModalOpen(true)} title="Adicionar NPC">
                    + Adicionar NPC
                  </button>
                </div>

                <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                  {npcs.map((n) => (
                    <div key={n.id} className="list-row">
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 900 }}>
                          {n.name || "NPC"}{" "}
                          <span className="muted" style={{ fontWeight: 700 }}>
                            • {String(n.scene || "").trim() || "sem cena"}
                          </span>
                        </div>
                        <div className="muted" style={{ fontSize: 12 }}>
                          HP: {clampNum(n.hpCurrent)}/{clampNum(n.hpMax)} • CA: {clampNum(n.armorClass, 10)} • Init:{" "}
                          {clampNum(n.initMod)}
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 8 }}>
                        <button className="ui-btn" onClick={() => includeNpcInCombat(n.id)} title="Adicionar ao combate">
                          ⚔️
                        </button>
                        <button className="ui-btn ui-btn-danger" onClick={() => deleteNpcById(n.id)} title="Apagar NPC">
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))}
                  {!npcs.length && <div className="muted">Nenhum NPC cadastrado.</div>}
                </div>
              </div>
            )}

            {activeTab === "combate" && (
              <div className="ui-card">
                {/* Header: igual ao player (sem título duplicado) */}
                <div className="combat-header">
                  <select
                    className="ui-input"
                    style={{ minWidth: 210, flex: "1 1 210px" }}
                    value={combatScene}
                    onChange={(e) => setCombatScene(e.target.value)}
                    title="Filtrar NPCs por cena"
                  >
                    <option value="">Cena (nenhuma)</option>
                    {sceneOptions.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>

                  <button className="ui-btn combat-add-btn" onClick={() => setCombatAddOpen(true)} title="Adicionar NPC ao combate">
                    + NPC
                  </button>
                </div>

                <div style={{ marginTop: 10 }}>
                  <button className="ui-btn ui-btn-primary" onClick={rollNpcInitiative} title="Rolar iniciativa para NPCs no combate" style={{ width: "100%" }}>
                    Rolar iniciativa
                  </button>
                </div>

                <div className="table-wrap combat-table-wrap">
                  <table className="ui-table combat-table">
                    <thead>
                      <tr>
                        <th>Nome</th>
                        <th>HP Máx</th>
                        <th>HP Atual</th>
                        <th>Iniciativa</th>
                        <th>Condições</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {combatRows.map((r) => (
                        <tr key={r.key}>
                          <td style={{ fontWeight: 900 }}>{r.name}</td>
                          <td>{r.hpMax}</td>

<td>
  <input
    className="ui-input"
    inputMode="numeric"
    value={String(r.hpCurrent ?? "")}
    onChange={async (e) => {
      const nextVal = clampNum(e.target.value, 0);
      if (r.kind === "player") {
        await updateDoc(playerRef(r.id), { hpCurrent: nextVal, updatedAt: serverTimestamp() });
      } else {
        await updateDoc(npcRef(r.id), { hpCurrent: nextVal, updatedAt: serverTimestamp() });
      }
    }}
  />
</td>
<td>
  <input
    className="ui-input"
    inputMode="numeric"
    value={r.initiative ? String(r.initiative) : ""}
    onChange={async (e) => {
      const nextVal = clampNum(e.target.value, 0);
      const next = { ...(combatState || {}) };
      next[r.key] = { ...(next[r.key] || {}), initiative: nextVal };
      await updateCombatState(next);
    }}
  />
</td>
<td>
  <ConditionsTags
    value={r.conditions}
    placeholder="Adicionar condição…"
    onChange={async (nextConditions) => {
      const next = { ...(combatState || {}) };
      next[r.key] = { ...(next[r.key] || {}), conditions: nextConditions };
      await updateCombatState(next);
    }}
  />
</td>

                          <td style={{ width: 56, textAlign: "right" }}>
                            {r.kind === "npc" ? (
                              <button className="ui-btn ui-btn-danger" onClick={() => excludeNpcFromCombat(r.id)} title="Remover do combate">
                                ✕
                              </button>
                            ) : (
                              <span className="muted" style={{ fontSize: 12 }}>
                                —
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {!combatRows.length && (
                        <tr>
                          <td colSpan={6} className="muted">
                            Nenhum participante.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </main>
        </div>

        <aside className="sheet-side">
          <LiveFeed viewerId="mestre" isMaster title="Rolagens (mesa)" maxItems={15} ttlMinutes={30} />
        </aside>
      </div>

      {/* Floating Roller */}
      <button className="fab-roll" type="button" onClick={() => setRollerOpen(true)} aria-label="Abrir rolador">
        🎲
      </button>

      {/* Combat: add NPC */}
      <Modal open={combatAddOpen} onClose={() => setCombatAddOpen(false)} title="Adicionar NPC ao combate">
        <div className="field">
          <label className="field-label">Escolher NPC</label>
          <select className="ui-input" value={npcToAddId} onChange={(e) => setNpcToAddId(e.target.value)}>
            <option value="">Selecione...</option>
            {npcs.map((n) => (
              <option key={n.id} value={n.id}>
                {(n.name || "NPC") + (n.scene ? ` • ${n.scene}` : "")}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          <button
            className="ui-btn ui-btn-primary"
            onClick={async () => {
              if (!npcToAddId) return;
              await includeNpcInCombat(npcToAddId);
              setNpcToAddId("");
              setCombatAddOpen(false);
            }}
          >
            Adicionar
          </button>

          <button
            className="ui-btn"
            onClick={() => {
              setCombatAddOpen(false);
              setNpcModalOpen(true);
            }}
          >
            Criar novo NPC
          </button>
        </div>
      </Modal>

      {/* Roller Drawer */}
      
{/* Roller Drawer */}
<Drawer open={rollerOpen} onClose={() => setRollerOpen(false)} title="Rolador (Mestre)">
  <div className="ui-card" style={{ boxShadow: "none" }}>
    <div className="toggle-row" style={{ marginBottom: 10 }}>
  <button
    type="button"
    className={"toggle-btn" + (rollerSecret ? " active" : "")}
    onClick={() => setRollerSecret((v) => !v)}
  >
    Secreta
  </button>
  <button
    type="button"
    className={"toggle-btn" + (rollerAdv ? " active" : "")}
    onClick={() => {
      setRollerAdv((v) => !v);
      setRollerDis(false);
    }}
  >
    Vantagem
  </button>
  <button
    type="button"
    className={"toggle-btn" + (rollerDis ? " active" : "")}
    onClick={() => {
      setRollerDis((v) => !v);
      setRollerAdv(false);
    }}
  >
    Desvantagem
  </button>
</div>

    <div className="field">
      <label className="field-label">Expressão</label>
      <input
        className="ui-input"
        value={rollerExpr}
        onChange={(e) => setRollerExpr(e.target.value)}
        placeholder="(vazio = 1d20) • Ex: 2d20kh1+5"
      />
    </div>

    {rollerSecret && lastSecretResult ? (
      <div className="ui-card" style={{ marginTop: 10 }}>
        <div style={{ fontWeight: 900, marginBottom: 6 }}>Resultado (secreto)</div>
        <div className="ui-muted" style={{ whiteSpace: "pre-wrap" }}>
          {lastSecretResult}
        </div>
      </div>
    ) : null}

    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
      <button className="ui-btn ui-btn-primary" onClick={sendMasterRoll} style={{ flex: 1 }}>
        Rolar
      </button>
      <button className="ui-btn" onClick={() => setRollerOpen(false)}>
        Fechar
      </button>
    </div>
  </div>
</Drawer>

      {/* Settings */}
      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Configurações do Mestre">
        <ThemePicker
          value={tableData?.preferences?.theme || "Neon Tokyo"}
          onChange={async (nextName) => {
            applyThemeVars(getTheme(nextName));
            await setDoc(tableRef(), { preferences: { ...(tableData?.preferences || {}), theme: nextName } }, { merge: true });
          }}
        />
      </Modal>

      {/* NPC modal */}
      <Modal open={npcModalOpen} onClose={() => setNpcModalOpen(false)} title="Cadastrar NPC">
        <div className="grid-cards" style={{ marginTop: 10 }}>
          <div className="field">
            <label className="field-label">Nome</label>
            <input className="ui-input" value={npcForm.name} onChange={(e) => setNpcForm((f) => ({ ...f, name: e.target.value }))} />
          </div>

          <div className="field">
            <label className="field-label">Cena</label>
            <input className="ui-input" value={npcForm.scene} onChange={(e) => setNpcForm((f) => ({ ...f, scene: e.target.value }))} placeholder="Ex: Torre" />
          </div>

          <div className="field">
            <label className="field-label">HP Máx</label>
            <input className="ui-input" inputMode="numeric" value={npcForm.hpMax} onChange={(e) => setNpcForm((f) => ({ ...f, hpMax: clampNum(e.target.value, 0) }))} />
          </div>

          <div className="field">
            <label className="field-label">HP Atual</label>
            <input className="ui-input" inputMode="numeric" value={npcForm.hpCurrent} onChange={(e) => setNpcForm((f) => ({ ...f, hpCurrent: clampNum(e.target.value, 0) }))} />
          </div>

          <div className="field">
            <label className="field-label">Armor Class</label>
            <input className="ui-input" inputMode="numeric" value={npcForm.armorClass} onChange={(e) => setNpcForm((f) => ({ ...f, armorClass: clampNum(e.target.value, 10) }))} />
          </div>

          <div className="field">
            <label className="field-label">MOD Iniciativa</label>
            <input className="ui-input" inputMode="numeric" value={npcForm.initMod} onChange={(e) => setNpcForm((f) => ({ ...f, initMod: clampNum(e.target.value, 0) }))} />
          </div>
        </div>

        <div className="field">
          <label className="field-label">Notas</label>
          <textarea className="ui-input" rows={5} value={npcForm.notes} onChange={(e) => setNpcForm((f) => ({ ...f, notes: e.target.value }))} />
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button className="ui-btn ui-btn-primary" onClick={saveNpc} style={{ flex: 1 }}>
            Salvar NPC
          </button>
          <button className="ui-btn" onClick={() => setNpcModalOpen(false)}>
            Cancelar
          </button>
        </div>
      </Modal>
    </div>
  );
}
