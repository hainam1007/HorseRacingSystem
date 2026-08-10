const DEFAULT_ROWS = 4;

function SkeletonLine({ width = "100%" }) {
  return <span className="app-skeleton__line" style={{ width }} />;
}

function SkeletonCard() {
  return (
    <div className="app-skeleton__card">
      <span className="app-skeleton__media" />
      <SkeletonLine width="42%" />
      <SkeletonLine width="78%" />
      <SkeletonLine width="58%" />
    </div>
  );
}

function SkeletonRows({ rows = DEFAULT_ROWS }) {
  return (
    <div className="app-skeleton__rows">
      {Array.from({ length: rows }, (_, index) => (
        <div className="app-skeleton__row" key={index}>
          <span className="app-skeleton__avatar" />
          <div className="app-skeleton__row-copy">
            <SkeletonLine width={`${74 - (index % 3) * 9}%`} />
            <SkeletonLine width={`${48 + (index % 2) * 12}%`} />
          </div>
          <span className="app-skeleton__control" />
        </div>
      ))}
    </div>
  );
}

export default function LoadingSkeleton({
  ariaLabel = "Loading content",
  className = "",
  rows = DEFAULT_ROWS,
  variant = "page",
}) {
  if (variant === "auth") {
    return (
      <div className={`app-skeleton app-skeleton--auth ${className}`} aria-busy="true" aria-label={ariaLabel} role="status">
        <div className="app-skeleton__auth-card">
          <SkeletonLine width="24%" />
          <SkeletonLine width="68%" />
          <SkeletonLine width="86%" />
          <span className="app-skeleton__field" />
          <span className="app-skeleton__field" />
          <span className="app-skeleton__button" />
        </div>
      </div>
    );
  }

  if (variant === "inline") {
    return (
      <div className={`app-skeleton app-skeleton--inline ${className}`} aria-busy="true" aria-label={ariaLabel} role="status">
        <SkeletonLine width="38%" />
        <SkeletonLine width="72%" />
      </div>
    );
  }

  return (
    <section className={`app-skeleton app-skeleton--${variant} ${className}`} aria-busy="true" aria-label={ariaLabel} role="status">
      <div className="app-skeleton__heading">
        <SkeletonLine width="22%" />
        <SkeletonLine width="54%" />
      </div>

      {variant === "detail" && (
        <div className="app-skeleton__detail">
          <span className="app-skeleton__detail-media" />
          <div className="app-skeleton__detail-copy">
            <SkeletonLine width="36%" />
            <SkeletonLine width="82%" />
            <SkeletonLine width="70%" />
            <SkeletonRows rows={3} />
          </div>
        </div>
      )}

      {variant === "cards" && (
        <div className="app-skeleton__cards">
          {Array.from({ length: Math.min(rows, 6) }, (_, index) => <SkeletonCard key={index} />)}
        </div>
      )}

      {(variant === "list" || variant === "table") && <SkeletonRows rows={rows} />}

      {variant === "page" && (
        <>
          <div className="app-skeleton__metrics">
            {Array.from({ length: 4 }, (_, index) => (
              <div className="app-skeleton__metric" key={index}>
                <SkeletonLine width="44%" />
                <SkeletonLine width="68%" />
              </div>
            ))}
          </div>
          <SkeletonRows rows={rows} />
        </>
      )}
    </section>
  );
}
