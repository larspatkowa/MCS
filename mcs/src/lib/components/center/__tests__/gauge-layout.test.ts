import { describe, expect, it } from 'vitest';

import { getGaugeDialLayout } from '../gauge-layout.js';

describe('gauge dial layout', () => {
	it('switches to split readout mode for wide panels so text stays off the dial', () => {
		const layout = getGaugeDialLayout(320, 160, { hasLabel: true, allowRangeLabels: true });

		expect(layout.mode).toBe('split');
		expect(layout.valueAnchor).toBe('start');
		expect(layout.valueX).toBeGreaterThan(layout.cx + layout.rOuter);
		expect(layout.labelX).toBe(layout.valueX);
		expect(layout.labelY).toBeGreaterThan(layout.valueY);
	});

	it('prefers stacked mode for wide-but-tall panels so readout sits below the dial', () => {
		const layout = getGaugeDialLayout(420, 280, { hasLabel: true, allowRangeLabels: true });

		expect(layout.mode).toBe('stacked');
		expect(layout.valueAnchor).toBe('middle');
		expect(layout.valueX).toBe(layout.cx);
		expect(layout.valueY).toBeGreaterThan(layout.cy);
	});

	it('keeps stacked value and label separated in compact panels', () => {
		const layout = getGaugeDialLayout(190, 165, { hasLabel: true, allowRangeLabels: true });

		expect(layout.mode).toBe('stacked');
		expect(layout.labelY - layout.valueY).toBeGreaterThanOrEqual(16);
		expect(layout.valueY).toBeLessThan(layout.labelY);
	});
});
