import { describe, expect, it } from 'vitest';
import { InputController } from '../../src/lib/game/input';

describe('input controller', () => {
	it('maps movement keys correctly', () => {
		const input = new InputController();
		input.keyDown('ArrowUp');
		input.keyDown('ArrowLeft');
		input.keyDown('Space');
		input.keyDown('ControlLeft');
		expect(input.movement.forward).toBe(true);
		expect(input.movement.left).toBe(true);
		expect(input.movement.jump).toBe(true);
		expect(input.movement.descend).toBe(true);
		input.keyUp('ArrowUp');
		input.keyUp('ArrowLeft');
		input.keyUp('Space');
		input.keyUp('ControlLeft');
		expect(input.movement.forward).toBe(false);
		expect(input.movement.left).toBe(false);
		expect(input.movement.jump).toBe(false);
		expect(input.movement.descend).toBe(false);
	});

	it('tracks one-shot actions and palette selection', () => {
		const input = new InputController();
		input.keyDown('KeyE');
		input.keyDown('Digit3');
		expect(input.consumeAction('interactPortal')).toBe(true);
		expect(input.consumeAction('interactPortal')).toBe(false);
		expect(input.consumePaletteSelection(8)).toBe(2);
		expect(input.consumePaletteSelection(8)).toBeNull();
	});
});
