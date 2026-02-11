import * as THREE from 'three';
import { EPS, LOOK_SENS, PLAYER_EYE_HEIGHT, PLAYER_GRAVITY, PLAYER_JUMP_VELOCITY } from './constants';
import type { MovementInput, MovementState } from './types';

export interface CameraStepConfig {
	moveSpeed: number;
	speedMultiplier: number;
	maxFeetY: number;
	minFeetY: number;
	stepHeight: number;
	gravity?: number;
	jumpVelocity?: number;
}

export class FirstPersonCameraController {
	readonly yawObject = new THREE.Object3D();
	readonly pitchObject = new THREE.Object3D();
	readonly state: MovementState = {
		grounded: false,
		feetY: 4,
		velocityY: 0
	};

	private jumpHeld = false;

	constructor(private readonly camera: THREE.PerspectiveCamera) {
		this.camera.position.set(0, PLAYER_EYE_HEIGHT, 0);
		this.pitchObject.add(this.camera);
		this.yawObject.add(this.pitchObject);
	}

	setFeetPosition(x: number, y: number, z: number): void {
		this.yawObject.position.set(x, y, z);
		this.state.feetY = y;
	}

	rotateByMouse(deltaX: number, deltaY: number, sensitivity = LOOK_SENS): void {
		this.yawObject.rotation.y -= deltaX * sensitivity;
		this.pitchObject.rotation.x -= deltaY * sensitivity;
		this.pitchObject.rotation.x = Math.max(
			-Math.PI / 2 + 0.02,
			Math.min(Math.PI / 2 - 0.02, this.pitchObject.rotation.x)
		);
	}

	step(
		dt: number,
		input: MovementInput,
		config: CameraStepConfig,
		sampleGroundFeetY: (x: number, z: number) => number
	): void {
		const moveStep = config.moveSpeed * config.speedMultiplier * dt;
		const startX = this.yawObject.position.x;
		const startZ = this.yawObject.position.z;
		if (input.forward) this.yawObject.translateZ(-moveStep);
		if (input.backward) this.yawObject.translateZ(moveStep);
		if (input.left) this.yawObject.translateX(-moveStep);
		if (input.right) this.yawObject.translateX(moveStep);

		const movedGroundFeet = sampleGroundFeetY(this.yawObject.position.x, this.yawObject.position.z);
		if (this.state.grounded && movedGroundFeet - this.state.feetY > config.stepHeight) {
			this.yawObject.position.x = startX;
			this.yawObject.position.z = startZ;
		}

		const gravity = config.gravity ?? PLAYER_GRAVITY;
		const jumpVelocity = config.jumpVelocity ?? PLAYER_JUMP_VELOCITY;
		if (input.jump && this.state.grounded && !this.jumpHeld) {
			this.state.velocityY = jumpVelocity;
			this.state.grounded = false;
		}
		this.jumpHeld = input.jump;

		this.state.velocityY += gravity * dt;
		this.state.feetY += this.state.velocityY * dt;

		const groundFeet = sampleGroundFeetY(this.yawObject.position.x, this.yawObject.position.z);
		if (this.state.feetY <= groundFeet + EPS) {
			this.state.feetY = groundFeet;
			this.state.velocityY = 0;
			this.state.grounded = true;
		} else {
			this.state.grounded = false;
		}

		if (this.state.feetY > config.maxFeetY) {
			this.state.feetY = config.maxFeetY;
			this.state.velocityY = 0;
		}
		if (this.state.feetY < config.minFeetY) {
			this.state.feetY = config.minFeetY;
			this.state.velocityY = 0;
			this.state.grounded = true;
		}

		this.yawObject.position.y = this.state.feetY;
	}

	lookAt(target: THREE.Vector3): void {
		const eye = this.getEyePosition();
		const dir = target.clone().sub(eye).normalize();
		const pitch = Math.asin(Math.max(-1, Math.min(1, dir.y)));
		const yaw = Math.atan2(-dir.x, -dir.z);
		this.yawObject.rotation.y = yaw;
		this.pitchObject.rotation.x = pitch;
	}

	getEyePosition(): THREE.Vector3 {
		return new THREE.Vector3(
			this.yawObject.position.x,
			this.yawObject.position.y + PLAYER_EYE_HEIGHT,
			this.yawObject.position.z
		);
	}
}
