import { THEMES, THEME_NAMES } from "../theme/themes";

/**
 * ThemePicker
 * - Shows only color circles (no names), but keeps accessibility via aria-label / title.
 * - Uses a conic gradient with bg/surface + accent colors so the "theme vibe" is visible.
 */
export default function ThemePicker({ value, onChange }) {
  return (
    <div className="theme-picker" role="list" aria-label="Selecionar tema">
      {THEME_NAMES.map((name) => {
        const t = THEMES[name];
        const isActive = value === name;

        // Show 4 key colors in a single circle (bg/surface + accent + accent2)
        const swatch = `conic-gradient(from 210deg, ${t.accent}, ${t.accent2}, ${t.surface}, ${t.bg}, ${t.accent})`;

        return (
          <button
            key={name}
            type="button"
            role="listitem"
            className={`theme-swatch ${isActive ? "active" : ""}`}
            onClick={() => onChange(name)}
            aria-label={`Tema: ${name}`}
            title={name}
            style={{ backgroundImage: swatch }}
          />
        );
      })}
    </div>
  );
}
