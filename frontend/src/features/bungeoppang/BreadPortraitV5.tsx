import { BREAD_FILLINGS, type BreadFilling } from './rulesV4';

/** The same cutaway pastry identifies a filling in orders and stored bread. */
export function BreadPortraitV5({ filling }: { filling: BreadFilling }) {
  return <span className="bung25-bread-portrait" data-filling={filling} aria-hidden="true"
    style={{ backgroundPosition: `${BREAD_FILLINGS.indexOf(filling) * 100 / 3}% center` }} />;
}
