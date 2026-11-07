"use client";

import Icon from "./Icon";

// White <-> black theme. The inline script in the root layout applies the saved choice before first paint.
export default function ThemeToggle() {
  function toggle() {
    const el = document.documentElement;
    const next = el.getAttribute("data-theme") === "dark" ? "light" : "dark";
    el.setAttribute("data-theme", next);
    try {
      localStorage.setItem("oiq-theme", next);
    } catch {
      /* storage can be blocked; the theme still switches for this visit */
    }
  }
  return (
    <button type="button" className="iconbtn theme-toggle" onClick={toggle} aria-label="Switch between white and black theme" title="Switch theme">
      <span className="t-sun"><Icon name="sun" /></span>
      <span className="t-moon"><Icon name="moon" /></span>
    </button>
  );
}
