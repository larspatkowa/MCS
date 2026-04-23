export interface GridPosition {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface DragState {
	startX: number;
	startY: number;
	initialPosition: GridPosition;
	gridSize: [number, number];
}

export function snapToGrid(
	pixelPos: number,
	gridSize: number,
	min: number = 0,
	max: number = Infinity
): number {
	const snapped = Math.round(pixelPos / gridSize) * gridSize;
	return Math.max(min, Math.min(max, snapped));
}

export function pixelToGrid(pixelPos: number, gridSize: number): number {
	return Math.round(pixelPos / gridSize);
}

export function gridToPixel(gridPos: number, gridSize: number): number {
	return gridPos * gridSize;
}

export function calculateSnappedPosition(
	rawPosition: GridPosition,
	gridSize: [number, number],
	bounds?: {
		minX?: number;
		minY?: number;
		maxX?: number;
		maxY?: number;
		minWidth?: number;
		minHeight?: number;
	}
): GridPosition {
	const minWidth = bounds?.minWidth ?? gridSize[0];
	const minHeight = bounds?.minHeight ?? gridSize[1];

	const snappedX = snapToGrid(rawPosition.x, gridSize[0], bounds?.minX ?? 0, bounds?.maxX);
	const snappedY = snapToGrid(rawPosition.y, gridSize[1], bounds?.minY ?? 0, bounds?.maxY);
	const snappedWidth = Math.max(minWidth, snapToGrid(rawPosition.width, gridSize[0], minWidth));
	const snappedHeight = Math.max(minHeight, snapToGrid(rawPosition.height, gridSize[1], minHeight));

	return {
		x: snappedX,
		y: snappedY,
		width: snappedWidth,
		height: snappedHeight
	};
}

export function createDragState(
	startX: number,
	startY: number,
	initialPosition: GridPosition,
	gridSize: [number, number]
): DragState {
	return {
		startX,
		startY,
		initialPosition,
		gridSize
	};
}

export function updateDragPosition(
	dragState: DragState,
	currentX: number,
	currentY: number,
	mode: 'move' | 'resize',
	resizeHandle?: 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w',
	scale: number = 1
): GridPosition {
	const rawDeltaX = currentX - dragState.startX;
	const rawDeltaY = currentY - dragState.startY;
	const deltaX = rawDeltaX / scale;
	const deltaY = rawDeltaY / scale;
	const { initialPosition, gridSize } = dragState;

	if (mode === 'move') {
		return {
			x: initialPosition.x + deltaX,
			y: initialPosition.y + deltaY,
			width: initialPosition.width,
			height: initialPosition.height
		};
	} else {
		let newPos = { ...initialPosition };

		if (resizeHandle?.includes('e')) {
			newPos.width = initialPosition.width + deltaX;
		}
		if (resizeHandle?.includes('w')) {
			newPos.x = initialPosition.x + deltaX;
			newPos.width = initialPosition.width - deltaX;
		}
		if (resizeHandle?.includes('s')) {
			newPos.height = initialPosition.height + deltaY;
		}
		if (resizeHandle?.includes('n')) {
			newPos.y = initialPosition.y + deltaY;
			newPos.height = initialPosition.height - deltaY;
		}

		return newPos;
	}
}
