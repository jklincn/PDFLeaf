import appIconUrl from "../../src-tauri/icons/icon.png";

export function AppTopbar() {
  return (
    <section className="app-topbar" aria-label="应用工具栏">
      <div className="app-brand">
        <img src={appIconUrl} alt="" aria-hidden="true" />
        <strong>PDFLeaf</strong>
      </div>
    </section>
  );
}
