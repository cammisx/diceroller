export function rollD20() {
  return Math.floor(Math.random() * 20) + 1;
}

export function abilityModifier(score) {
  return Math.floor((score - 10) / 2);
}

/**
 * rollDiceExpression
 * Suporta:
 *  - "XdY" (ex: 2d6)
 *  - "XdY+Z" / "XdY - Z"
 *  - múltiplos termos: "2d6+1d4+3" / "d20 + 5" / "4d8-2d6+10"
 *
 * Retorna um objeto com:
 *  - total
 *  - terms: [{ kind: 'dice'|'num', sign, ... }]
 *
 * Mantém compatibilidade: para expressões simples, também retorna
 * {count, sides, rolls, sum, mod}.
 */
export function rollDiceExpression(expr) {
  const clean = String(expr || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");

  if (!clean) return null;
  if (!/^[0-9d+\-]+$/.test(clean)) return null;

  // Divide em termos mantendo sinal
  const parts = clean.match(/[+\-]?[^+\-]+/g);
  if (!parts || parts.length === 0) return null;

  const terms = [];
  let total = 0;

  for (const raw of parts) {
    if (!raw) continue;
    const sign = raw.startsWith("-") ? -1 : 1;
    const body = raw.replace(/^[+\-]/, "");
    if (!body) return null;

    if (body.includes("d")) {
      const m = body.match(/^(\d*)d(\d+)$/);
      if (!m) return null;
      const count = Number(m[1] || 1);
      const sides = Number(m[2]);
      if (!Number.isFinite(count) || !Number.isFinite(sides) || count < 1 || sides < 2) return null;

      const rolls = [];
      for (let i = 0; i < count; i++) rolls.push(Math.floor(Math.random() * sides) + 1);
      const sum = rolls.reduce((a, b) => a + b, 0);
      const signed = sign * sum;
      total += signed;
      terms.push({ kind: "dice", sign, count, sides, rolls, sum });
    } else {
      const value = Number(body);
      if (!Number.isFinite(value)) return null;
      const signed = sign * value;
      total += signed;
      terms.push({ kind: "num", sign, value });
    }
  }

  // compat: "XdY(+/-Z)" exatamente
  const simple = clean.match(/^(\d*)d(\d+)([+-]\d+)?$/);
  if (simple) {
    const count = Number(simple[1] || 1);
    const sides = Number(simple[2]);
    const mod = Number(simple[3] || 0);
    // Precisamos refazer a rolagem de forma compatível para o detalhamento simples
    // (sem multiplicar termos). Usa o primeiro termo dice como fonte dos rolls.
    const diceTerm = terms.find((t) => t.kind === "dice");
    const rolls = diceTerm?.rolls || [];
    const sum = diceTerm?.sum || 0;
    return { total, terms, count, sides, rolls, sum, mod };
  }

  return { total, terms };
}

export function formatDiceResult(result) {
  if (!result) return "";
  const terms = Array.isArray(result.terms) ? result.terms : [];
  if (terms.length === 0) return String(result.total ?? "");

  const chunks = terms.map((t) => {
    const prefix = t.sign < 0 ? "-" : "+";
    if (t.kind === "dice") {
      return `${prefix} ${t.count}d${t.sides}: ${t.rolls.join(" + ")} = ${t.sum}`;
    }
    return `${prefix} ${t.value}`;
  });

  // remove o primeiro "+"
  if (chunks[0]?.startsWith("+")) chunks[0] = chunks[0].replace(/^\+\s*/, "");

  return `${chunks.join(" ")} → ${result.total}`;
}
