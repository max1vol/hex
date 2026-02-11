import type { MovementInput } from './types';

type ActionKey =
	| 'toggleMenu'
	| 'resumeGame'
	| 'toggleMute'
	| 'regenerateWorld'
	| 'toggleFast'
	| 'interactPortal';

export class InputController {
	readonly movement: MovementInput = {
		forward: false,
		backward: false,
		left: false,
		right: false,
		jump: false,
		descend: false
	};

	private readonly actions = new Set<ActionKey>();
	private paletteSelection: number | null = null;

	keyDown(code: string): void {
		switch (code) {
			case 'KeyW':
			case 'ArrowUp':
				this.movement.forward = true;
				return;
			case 'KeyA':
			case 'ArrowLeft':
				this.movement.left = true;
				return;
			case 'KeyS':
			case 'ArrowDown':
				this.movement.backward = true;
				return;
			case 'KeyD':
			case 'ArrowRight':
				this.movement.right = true;
				return;
			case 'Space':
				this.movement.jump = true;
				return;
			case 'ShiftLeft':
			case 'ShiftRight':
			case 'ControlLeft':
			case 'ControlRight':
				this.movement.descend = true;
				return;
			case 'Escape':
				this.actions.add('toggleMenu');
				return;
			case 'Enter':
				this.actions.add('resumeGame');
				return;
			case 'KeyM':
				this.actions.add('toggleMute');
				return;
			case 'KeyR':
				this.actions.add('regenerateWorld');
				return;
			case 'KeyF':
				this.actions.add('toggleFast');
				return;
			case 'KeyE':
				this.actions.add('interactPortal');
				return;
		}

		if (!code.startsWith('Digit')) return;
		const n = Number(code.replace('Digit', ''));
		if (!Number.isFinite(n) || n <= 0) return;
		this.paletteSelection = n - 1;
	}

	keyUp(code: string): void {
		switch (code) {
			case 'KeyW':
			case 'ArrowUp':
				this.movement.forward = false;
				break;
			case 'KeyA':
			case 'ArrowLeft':
				this.movement.left = false;
				break;
			case 'KeyS':
			case 'ArrowDown':
				this.movement.backward = false;
				break;
			case 'KeyD':
			case 'ArrowRight':
				this.movement.right = false;
				break;
			case 'Space':
				this.movement.jump = false;
				break;
			case 'ShiftLeft':
			case 'ShiftRight':
			case 'ControlLeft':
			case 'ControlRight':
				this.movement.descend = false;
				break;
		}
	}

	setVirtualMovement(next: Partial<MovementInput>): void {
		for (const key of Object.keys(next) as Array<keyof MovementInput>) {
			if (typeof next[key] === 'boolean') this.movement[key] = next[key] as boolean;
		}
	}

	consumeAction(action: ActionKey): boolean {
		if (!this.actions.has(action)) return false;
		this.actions.delete(action);
		return true;
	}

	consumePaletteSelection(max: number): number | null {
		if (this.paletteSelection === null) return null;
		const sel = this.paletteSelection;
		this.paletteSelection = null;
		if (sel < 0 || sel >= max) return null;
		return sel;
	}

	clearMovement(): void {
		for (const key of Object.keys(this.movement) as Array<keyof MovementInput>) {
			this.movement[key] = false;
		}
	}
}
