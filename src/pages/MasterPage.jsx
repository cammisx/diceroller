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
import { rollDiceExpression } from "../lib/dice";
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
  const [combatState, setCombatState] = useState({}); // map: key -> { initiative, conditions }
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rollerOpen, setRollerOpen] = useState(false);
  const [rollerExpr, setRollerExpr] = useState("1d20");

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

  const combatRows = useMemo(() => {
    const scene = combatScene.trim();
    const sceneNpcs = scene ? npcs.filter((n) => String(n.scene || "").trim() === scene) : [];
    const playerRows = players.map((p) => ({
      kind: "player",
      key: `p:${p.id}`,
      id: p.id,
      name: p.displayName || p.id,
      hpMax: clampNum(p.hpMax),
      hpCurrent: clampNum(p.hpCurrent),
      initMod: clampNum(p.initiativeMod || 0),
    }));
    const npcRows = sceneNpcs.map((n) => ({
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
      conditions: combatState?.[r.key]?.conditions || "",
    }));

    merged.sort((a, b) => (b.initiative || 0) - (a.initiative || 0));
    return merged;
  }, [players, npcs, combatScene, combatState]);

  async function rollNpcInitiative() {
    const scene = combatScene.trim();
    const sceneNpcs = scene ? npcs.filter((n) => String(n.scene || "").trim() === scene) : [];
    if (!sceneNpcs.length) return alert("Selecione uma Cena com NPCs para rolar iniciativa.");

    const next = { ...(combatState || {}) };
    for (const n of sceneNpcs) {
      const d20 = Math.floor(Math.random() * 20) + 1;
      const total = d20 + clampNum(n.initMod);
      next[`n:${n.id}`] = { ...(next[`n:${n.id}`] || {}), initiative: total };
    }
    await updateCombatState(next);
  }

  async function sendMasterRoll() {
    const expr = (rollerExpr || "").trim();
    if (!expr) return;

    const result = rollDiceExpression(expr);
    await addDoc(rollsCol(), {
      createdAt: serverTimestamp(),
      playerId: "mestre",
      playerName: "Mestre",
      kind: "Livre",
      label: expr,
      expr,
      result,
      isSecret: false,
    });
    setRollerExpr("");
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-title">Mestre</div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="ui-btn" onClick={() => setSettingsOpen(true)} title="Configurações">
            ⚙️
          </button>
        </div>
      </header>

      <div className="tabs-row">
        {[
          { key: "jogadores", label: "Jogadores" },
          { key: "combate", label: "Combate" },
        ].map((t) => (
          <button
            key={t.key}
            className={"tab-btn " + (activeTab === t.key ? "active" : "")}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <main className="app-main" style={{ paddingBottom: 90 }}>
        {activeTab === "jogadores" && (
          <div className="ui-card">
            <h3 style={{ marginTop: 0 }}>Jogadores</h3>

            <div className="form-row" style={{ gap: 8, flexWrap: "wrap" }}>
              <input
                className="ui-input"
                placeholder='Nome do jogador (ex: "Chloë")'
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <button className="ui-btn ui-btn-primary" onClick={createPlayer}>
                Criar
              </button>
            </div>

            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              {players.map((p) => {
                const url = `${baseUrl}/${p.id}`;
                return (
                  <div key={p.id} className="list-row">
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700 }}>{p.displayName || p.id}</div>
                      <div className="muted" style={{ fontSize: 12, wordBreak: "break-all" }}>
                        {url}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        className="ui-btn"
                        onClick={() => navigator.clipboard.writeText(url)}
                        title="Copiar link"
                      >
                        Copiar
                      </button>
                      <button className="ui-btn ui-btn-danger" onClick={() => deletePlayerById(p.id)} title="Apagar">
                        🗑️
                      </button>
                    </div>
                  </div>
                );
              })}
              {!players.length && <div className="muted">Nenhum jogador cadastrado ainda.</div>}
            </div>

            <hr style={{ margin: "14px 0", opacity: 0.25 }} />

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0 }}>NPCs</h3>
              <button className="ui-btn ui-btn-primary" onClick={() => setNpcModalOpen(true)} title="Adicionar NPC">
                +
              </button>
            </div>

            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              {npcs.map((n) => (
                <div key={n.id} className="list-row">
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>
                      {n.name} <span className="muted" style={{ fontWeight: 500 }}>• {n.scene || "sem cena"}</span>
                    </div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      HP: {clampNum(n.hpCurrent)}/{clampNum(n.hpMax)} • CA: {clampNum(n.armorClass, 10)} • Init: {clampNum(n.initMod)}
                    </div>
                  </div>
                  <button className="ui-btn ui-btn-danger" onClick={() => deleteNpcById(n.id)} title="Apagar NPC">
                    🗑️
                  </button>
                </div>
              ))}
              {!npcs.length && <div className="muted">Nenhum NPC cadastrado.</div>}
            </div>
          </div>
        )}

        {activeTab === "combate" && (
          <div className="ui-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <h3 style={{ marginTop: 0, marginBottom: 0 }}>Combate</h3>

              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <input
                  className="ui-input"
                  style={{ maxWidth: 220 }}
                  placeholder="Cena (ex: Torre)"
                  value={combatScene}
                  onChange={(e) => setCombatScene(e.target.value)}
                />
                <button className="ui-btn" onClick={() => setNpcModalOpen(true)} title="Adicionar NPC">
                  + NPC
                </button>
                <button className="ui-btn ui-btn-primary" onClick={rollNpcInitiative}>
                  Rolar iniciativa (NPCs)
                </button>
              </div>
            </div>

            <div className="table-wrap" style={{ marginTop: 12 }}>
              <table className="ui-table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>HP Máx</th>
                    <th>HP Atual</th>
                    <th>Iniciativa</th>
                    <th>Condições</th>
                  </tr>
                </thead>
                <tbody>
                  {combatRows.map((r) => (
                    <tr key={r.key}>
                      <td style={{ fontWeight: 700 }}>{r.name}</td>
                      <td>{r.hpMax}</td>
                      <td>
                        <input
                          className="ui-input"
                          style={{ width: 90 }}
                          inputMode="numeric"
                          value={r.hpCurrent}
                          onChange={async (e) => {
                            const v = clampNum(e.target.value, 0);
                            if (r.kind === "player") {
                              await setDoc(playerRef(r.id), { hpCurrent: v, updatedAt: serverTimestamp() }, { merge: true });
                            } else {
                              await setDoc(npcRef(r.id), { hpCurrent: v, updatedAt: serverTimestamp() }, { merge: true });
                            }
                          }}
                        />
                      </td>
                      <td>
                        <input
                          className="ui-input"
                          style={{ width: 90 }}
                          inputMode="numeric"
                          value={r.initiative || ""}
                          onChange={async (e) => {
                            const v = clampNum(e.target.value, 0);
                            const next = { ...(combatState || {}) };
                            next[r.key] = { ...(next[r.key] || {}), initiative: v };
                            await updateCombatState(next);
                          }}
                        />
                      </td>
                      <td>
                        <input
                          className="ui-input"
                          value={r.conditions}
                          onChange={async (e) => {
                            const next = { ...(combatState || {}) };
                            next[r.key] = { ...(next[r.key] || {}), conditions: e.target.value };
                            await updateCombatState(next);
                          }}
                          placeholder="Ex: Envenenado"
                        />
                      </td>
                    </tr>
                  ))}
                  {!combatRows.length && (
                    <tr>
                      <td colSpan={5} className="muted">
                        Nenhum participante.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 14 }}>
              <h4 style={{ margin: 0, marginBottom: 8 }}>Feed da mesa</h4>
              <LiveFeed viewerId="mestre" isMaster maxItems={15} ttlMinutes={30} title="Rolagens da mesa" />
            </div>
          </div>
        )}
      </main>

      {/* Floating Roller */}
      <button className="fab" onClick={() => setRollerOpen(true)} title="Abrir rolador">
        🎲
      </button>

      <Drawer open={rollerOpen} onClose={() => setRollerOpen(false)} title="Rolagem rápida (Mestre)">
        <div className="field">
          <label className="field-label">Expressão</label>
          <input className="ui-input" value={rollerExpr} onChange={(e) => setRollerExpr(e.target.value)} placeholder="Ex: 2d20kh1+5" />
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button className="ui-btn ui-btn-primary" onClick={sendMasterRoll}>
            Rolar (envia pro feed)
          </button>
          <button className="ui-btn" onClick={() => setRollerExpr("")}>
            Limpar
          </button>
        </div>
      </Drawer>

      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Configurações do Mestre">
        <ThemePicker
          value={tableData?.preferences?.theme || "Neon Tokyo"}
          onChange={async (theme) => {
            await setDoc(tableRef(), { preferences: { ...(tableData?.preferences || {}), theme } }, { merge: true });
          }}
        />
      </Modal>

      <Modal open={npcModalOpen} onClose={() => setNpcModalOpen(false)} title="Adicionar NPC">
        <div className="form-grid">
          <div className="field">
            <label className="field-label">Nome</label>
            <input className="ui-input" value={npcForm.name} onChange={(e) => setNpcForm((s) => ({ ...s, name: e.target.value }))} />
          </div>
          <div className="field">
            <label className="field-label">Cena</label>
            <input className="ui-input" value={npcForm.scene} onChange={(e) => setNpcForm((s) => ({ ...s, scene: e.target.value }))} placeholder="Ex: Taverna" />
          </div>
          <div className="field">
            <label className="field-label">HP Max</label>
            <input className="ui-input" inputMode="numeric" value={npcForm.hpMax} onChange={(e) => setNpcForm((s) => ({ ...s, hpMax: e.target.value }))} />
          </div>
          <div className="field">
            <label className="field-label">HP Atual</label>
            <input className="ui-input" inputMode="numeric" value={npcForm.hpCurrent} onChange={(e) => setNpcForm((s) => ({ ...s, hpCurrent: e.target.value }))} />
          </div>
          <div className="field">
            <label className="field-label">Armor Class</label>
            <input className="ui-input" inputMode="numeric" value={npcForm.armorClass} onChange={(e) => setNpcForm((s) => ({ ...s, armorClass: e.target.value }))} />
          </div>
          <div className="field">
            <label className="field-label">MOD Iniciativa</label>
            <input className="ui-input" inputMode="numeric" value={npcForm.initMod} onChange={(e) => setNpcForm((s) => ({ ...s, initMod: e.target.value }))} />
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label className="field-label">Notas</label>
            <textarea className="ui-input" rows={4} value={npcForm.notes} onChange={(e) => setNpcForm((s) => ({ ...s, notes: e.target.value }))} />
          </div>
        </div>

        <div className="controls-footer" style={{ marginTop: 10 }}>
          <button className="ui-btn ui-btn-primary" onClick={saveNpc}>
            Salvar
          </button>
          <button className="ui-btn" onClick={() => setNpcModalOpen(false)}>
            Cancelar
          </button>
        </div>
      </Modal>
    </div>
  );
}
