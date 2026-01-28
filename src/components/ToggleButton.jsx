export default function ToggleButton({ active, onClick, children }) {
  return (
    <button
      className={`toggle-btn ${active ? "active" : ""}`}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}
