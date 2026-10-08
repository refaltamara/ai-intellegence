/** What a page shows while its numbers load: the sidebar is already there, so the wait reads as loading, not as a stuck click. */
export function PageLoading({ label }: { label: string }) {
  return (
    <section className="screen pgload" aria-busy="true" aria-live="polite">
      <p className="pgload-label">{label}</p>
      <div className="pgload-row">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="pgload-tile" />
        ))}
      </div>
      <div className="pgload-block" />
      <div className="pgload-block short" />
    </section>
  );
}
