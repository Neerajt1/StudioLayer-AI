const SL_TOKEN_ICON = '/icons/sl-token.svg';
const STUDIO_SPARK_ICON = '/icons/studio-spark.svg';

const LEGEND_ITEMS = [
  {
    icon: SL_TOKEN_ICON,
    studioCredit: true,
    label: 'Credits Used',
    description: 'Studio Credits used to generate this Shoot.',
  },
  {
    icon: STUDIO_SPARK_ICON,
    label: 'Edits Made',
    description:
      'Paid image edits on this Shoot, such as Remove Background. Crop is free and not counted.',
  },
] as const;

export function GalleryLedgerLegend() {
  return (
    <section className="sl-gallery-legend" aria-label="Gallery legend">
      <ul className="sl-gallery-legend-list">
        {LEGEND_ITEMS.map((item) => (
          <li key={item.label} className="sl-gallery-legend-item">
            <img
              src={item.icon}
              alt=""
              aria-hidden
              className={
                'studioCredit' in item && item.studioCredit
                  ? 'sl-gallery-legend-icon sl-ledger-metric-icon sl-ledger-metric-icon--studio-credit'
                  : 'sl-gallery-legend-icon sl-ledger-metric-icon'
              }
            />
            <p className="sl-gallery-legend-title">{item.label}</p>
            <p className="sl-gallery-legend-description">{item.description}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
