import { useEffect, useMemo, useState } from "react";
import { onSnapshot, orderBy, query, serverTimestamp, setDoc, deleteDoc } from "firebase/firestore";
import { playerRef, playersCol } from "../lib/refs";
import LiveFeed from "../components/LiveFeed.jsx";

function slugify(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "");
}

export default function MasterPage() {
  const [name, setName] = useState("");
  const [players, setPlayers] = useState([]);

  const baseUrl = useMemo(() => window.location.origin, []);

  // players ao vivo
  useEffect(() => {
    const q = query(playersCol(), orderBy("createdAt", "desc"));
    return onSnapshot(q, (snap) => {
      setPlayers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
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

        // dados do personagem (serão preenchidos no setup do player)
        level: 1,
        abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
        skills: {},
        attacks: [],

        // preferências do rolador
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
    const ok = window.confirm(`Excluir o jogador "${playerId}"?`);
    if (!ok) return;
    await deleteDoc(playerRef(playerId));
  }

  return (
    <div className="player-page">
      <div className="player-layout">
        {/* Painel esquerdo */}
        <div className="roller-pane">
          <div className="ui-card player-controls-card">
            <div className="player-topbar">
              <div>
                <div className="player-name">Mestre</div>
                <div className="player-subline ui-muted">
                  Crie URLs por jogador e cole no Notion como <b>/embed</b>.
                </div>
              </div>

              <div className="ui-pill">Mesa: {import.meta.env.VITE_TABLE_ID || "default"}</div>
            </div>

            <div className="field">
              <div className="field-label">Cadastrar jogador</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
                <input
                  className="ui-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder='Nome / slug (ex: "chloe")'
                  onKeyDown={(e) => {
                    if (e.key === "Enter") createPlayer();
                  }}
                />
                <button className="ui-btn ui-btn-primary" style={{ width: "auto" }} onClick={createPlayer}>
                  Criar URL
                </button>
              </div>
              <div className="ui-muted" style={{ fontSize: 13 }}>
                Dica: o link fica assim: <b>{baseUrl}/chloe</b>
              </div>
            </div>
          </div>

          <div className="ui-card player-controls-card">
            <div className="section-title">Jogadores</div>

            {players.length === 0 ? (
              <div className="ui-muted">Nenhum jogador cadastrado ainda.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {players.map((p) => {
                  const url = `${baseUrl}/${p.id}`;
                  return (
                    <div
                      key={p.id}
                      className="toggle-row"
                      style={{ alignItems: "start", gap: 12 }}
                    >
                      <div style={{ display: "grid", gap: 4 }}>
                        <div style={{ fontWeight: 950 }}>
                          {p.displayName || p.id}{" "}
                          <span className="ui-pill" style={{ marginLeft: 8 }}>
                            /{p.id}
                          </span>
                        </div>
                        <div className="ui-muted" style={{ fontSize: 13 }}>
                          <a href={url} target="_blank" rel="noreferrer">
                            {url}
                          </a>
                        </div>
                        <div className="ui-muted" style={{ fontSize: 12 }}>
                          Setup: {p.hasSetup ? "✅ feito" : "⏳ pendente"}
                        </div>
                      </div>

                      <div style={{ display: "grid", gap: 8, minWidth: 140 }}>
                        <button
                          className="ui-btn"
                          onClick={() => {
                            navigator.clipboard?.writeText(url);
                            alert("Link copiado!");
                          }}
                        >
                          Copiar link
                        </button>
                        <button className="ui-btn ui-btn-ghost" onClick={() => deletePlayerById(p.id)}>
                          Excluir
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Painel direito */}
        <div className="feed-pane">
          <LiveFeed viewerId="mestre" isMaster title="Feed ao vivo (mesa)" />
        </div>
      </div>
    </div>
  );
}
