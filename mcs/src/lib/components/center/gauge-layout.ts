export type GaugeDialReadoutMode = 'stacked' | 'split';

export interface GaugeDialLayout {
	mode: GaugeDialReadoutMode;
	cx: number;
	cy: number;
	rOuter: number;
	rTrack: number;
	rFill: number;
	rNeedle: number;
	rHub: number;
	rTickOuter: number;
	rTickInnerMajor: number;
	rTickInnerMinor: number;
	rTickLabel: number;
	showTickLabels: boolean;
	showLabel: boolean;
	showRangeLabels: boolean;
	valueX: number;
	valueY: number;
	valueAnchor: 'middle' | 'start';
	valueFontSize: number;
	labelX: number;
	labelY: number;
	labelAnchor: 'middle' | 'start';
	labelFontSize: number;
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

export function getGaugeDialLayout(
	width: number,
	height: number,
	options: { hasLabel: boolean; allowRangeLabels: boolean }
): GaugeDialLayout {
	const safeWidth = Math.max(120, width || 0);
	const safeHeight = Math.max(100, height || 0);
	// Prefer split mode whenever the cell is meaningfully wider than it is tall —
	// that is where stacked readouts typically collide with the 270° arc.
	const aspect = safeWidth / safeHeight;
	const shouldSplit =
		(safeWidth >= 240 && aspect >= 1.55) || (safeWidth >= 300 && safeHeight <= 210);
	const mode: GaugeDialReadoutMode = shouldSplit ? 'split' : 'stacked';

	if (mode === 'split') {
		const reservedReadout = clamp(safeWidth * 0.32, 96, 170);
		const dialWidth = Math.max(110, safeWidth - reservedReadout - 18);
		const cx = clamp(dialWidth * 0.5, 60, safeWidth * 0.44);
		const cy = safeHeight * 0.5;
		const rOuter = clamp(Math.min(dialWidth * 0.44, safeHeight * 0.46, cx - 14), 36, 170);
		const valueX = clamp(cx + rOuter + 20, 0, safeWidth - 14);
		const valueFontSize = clamp(safeHeight * 0.2, 15, 26);
		const labelFontSize = clamp(safeHeight * 0.1, 10, 13);
		const hasLabel = options.hasLabel && safeHeight >= 80;
		// Stack value + optional label vertically in the readout column
		const totalReadout = valueFontSize + (hasLabel ? labelFontSize + 6 : 0);
		const valueY = clamp(cy - totalReadout / 2 + valueFontSize * 0.5, 20, safeHeight - 16);
		const labelY = valueY + valueFontSize * 0.6 + labelFontSize * 0.5 + 6;

		return {
			mode,
			cx,
			cy,
			rOuter,
			rTrack: rOuter * 0.85,
			rFill: rOuter * 0.85,
			rNeedle: rOuter * 0.78,
			rHub: rOuter * 0.08,
			rTickOuter: rOuter * 0.92,
			rTickInnerMajor: rOuter * 0.82,
			rTickInnerMinor: rOuter * 0.87,
			rTickLabel: rOuter * 0.68,
			showTickLabels: safeWidth >= 280 && safeHeight >= 140,
			showLabel: hasLabel,
			showRangeLabels: options.allowRangeLabels && safeHeight >= 130,
			valueX,
			valueY,
			valueAnchor: 'start',
			valueFontSize,
			labelX: valueX,
			labelY,
			labelAnchor: 'start',
			labelFontSize
		};
	}

	// Stacked: dial arc on top, value read-out clearly below the arc bottom.
	const valueFontSize = clamp(safeHeight * 0.14, 13, 22);
	const labelFontSize = clamp(safeHeight * 0.08, 9, 12);
	const hasLabel = options.hasLabel && safeHeight >= 150;
	const valueRowH = valueFontSize + (hasLabel ? labelFontSize + 6 : 0);
	// Reserve below the dial for: gap + value row + optional label + bottom margin.
	const bottomReserve = valueRowH + 14;
	const topMargin = 10;
	// Fit 2*rOuter inside (safeHeight - topMargin - bottomReserve). Width is also capped.
	const rOuterCap = Math.min(safeWidth * 0.46, (safeHeight - topMargin - bottomReserve) / 2);
	const rOuter = clamp(rOuterCap, 32, 170);
	const cx = safeWidth / 2;
	// Center the dial vertically in its allotted half (above the readout row).
	const cy = topMargin + rOuter;
	const valueY = cy + rOuter + valueFontSize * 0.55 + 6;
	const labelY = valueY + valueFontSize * 0.5 + labelFontSize * 0.5 + 4;

	return {
		mode,
		cx,
		cy,
		rOuter,
		rTrack: rOuter * 0.85,
		rFill: rOuter * 0.85,
		rNeedle: rOuter * 0.78,
		rHub: rOuter * 0.08,
		rTickOuter: rOuter * 0.92,
		rTickInnerMajor: rOuter * 0.82,
		rTickInnerMinor: rOuter * 0.87,
		rTickLabel: rOuter * 0.68,
		showTickLabels: safeHeight >= 190 && safeWidth >= 200,
		showLabel: hasLabel,
		showRangeLabels: options.allowRangeLabels && safeHeight >= 170,
		valueX: cx,
		valueY,
		valueAnchor: 'middle',
		valueFontSize,
		labelX: cx,
		labelY,
		labelAnchor: 'middle',
		labelFontSize
	};
}
