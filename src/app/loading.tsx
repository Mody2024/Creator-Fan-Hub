export default function Loading() {
  return (
    <main className="raye2-app-loading" role="status" aria-live="polite" aria-busy="true">
      <span className="raye2-app-loading-mark" aria-hidden="true">
        <span>R</span>
        <i />
      </span>
      <span className="raye2-app-loading-text">Preparing your space</span>
    </main>
  );
}
