import { describe, expect, it } from 'vitest';
import { InputController } from '../../src/lib/game/input';

describe('input controller', () => {
	it('maps movement keys correctly', () => {
		const input = new InputController();
		input.keyDown('KeyW');
		input.keyDown('Space');
		expect(input.movement.forward).toBe(true);
		expect(input.movement.jump).toBe(true);
		input.keyUp('KeyW');
		input.keyUp('Space');
		expect(input.movement.forward).toBe(false);
		expect(input.movement.jump).toBe(false);
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
