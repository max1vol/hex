import type { BlockType } from './types';

interface AudioEngine {
	ctx: AudioContext;
	master: GainNode;
	noiseBuf: AudioBuffer;
}

export class HexWorldAudio {
	private muted = false;
	private engine: AudioEngine | null = null;

	setMuted(next: boolean): void {
		this.muted = next;
	}

	toggleMuted(): boolean {
		this.muted = !this.muted;
		return this.muted;
	}

	isMuted(): boolean {
		return this.muted;
	}

	playPlace(typeKey: BlockType): void {
		if (this.muted) return;
		const a = this.ensureEngine();
		if (!a) return;
		const { ctx, master, noiseBuf } = a;
		void ctx.resume();
		const t = ctx.currentTime;

		const tone = ctx.createOscillator();
		const toneGain = ctx.createGain();
		const toneFilter = ctx.createBiquadFilter();
		tone.type = 'triangle';

		let base = 220;
		if (typeKey === 'stone') base = 180;
		if (typeKey === 'sand') base = 260;
		if (typeKey === 'grass') base = 240;
		base *= 1 + (Math.random() * 0.08 - 0.04);

		tone.frequency.setValueAtTime(base, t);
		tone.frequency.exponentialRampToValueAtTime(Math.max(60, base * 0.55), t + 0.07);
		toneFilter.type = 'lowpass';
		toneFilter.frequency.setValueAtTime(9000, t);
		toneFilter.frequency.exponentialRampToValueAtTime(2200, t + 0.06);

		toneGain.gain.setValueAtTime(0.0001, t);
		toneGain.gain.exponentialRampToValueAtTime(0.22, t + 0.005);
		toneGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);

		tone.connect(toneFilter);
		toneFilter.connect(toneGain);
		toneGain.connect(master);
		tone.start(t);
		tone.stop(t + 0.11);

		const n = ctx.createBufferSource();
		n.buffer = noiseBuf;
		const nGain = ctx.createGain();
		const nFilter = ctx.createBiquadFilter();
		nFilter.type = 'bandpass';
		nFilter.frequency.setValueAtTime(typeKey === 'sand' ? 1100 : 1900, t);
		nFilter.Q.setValueAtTime(typeKey === 'stone' ? 0.9 : 0.7, t);

		nGain.gain.setValueAtTime(0.0001, t);
		nGain.gain.exponentialRampToValueAtTime(typeKey === 'stone' ? 0.1 : 0.07, t + 0.004);
		nGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);

		n.connect(nFilter);
		nFilter.connect(nGain);
		nGain.connect(master);
		n.start(t);
		n.stop(t + 0.04);
	}

	playBreak(typeKey: BlockType): void {
		if (this.muted) return;
		const a = this.ensureEngine();
		if (!a) return;
		const { ctx, master, noiseBuf } = a;
		void ctx.resume();
		const t = ctx.currentTime;

		const n = ctx.createBufferSource();
		n.buffer = noiseBuf;
		const nGain = ctx.createGain();
		const nFilter = ctx.createBiquadFilter();
		nFilter.type = 'bandpass';
		const f0 = typeKey === 'stone' ? 1800 : typeKey === 'sand' ? 900 : 1400;
		const f1 = typeKey === 'stone' ? 700 : typeKey === 'sand' ? 420 : 540;
		nFilter.frequency.setValueAtTime(f0, t);
		nFilter.frequency.exponentialRampToValueAtTime(f1, t + 0.16);
		nFilter.Q.setValueAtTime(typeKey === 'stone' ? 1.15 : 0.9, t);

		nGain.gain.setValueAtTime(0.0001, t);
		nGain.gain.exponentialRampToValueAtTime(typeKey === 'stone' ? 0.34 : 0.26, t + 0.01);
		nGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);

		n.connect(nFilter);
		nFilter.connect(nGain);
		nGain.connect(master);
		n.start(t);
		n.stop(t + 0.22);

		const th = ctx.createOscillator();
		const thGain = ctx.createGain();
		th.type = typeKey === 'stone' ? 'sine' : 'triangle';
		const th0 = (typeKey === 'stone' ? 92 : typeKey === 'sand' ? 70 : 80) * (1 + (Math.random() * 0.06 - 0.03));
		th.frequency.setValueAtTime(th0, t);
		th.frequency.exponentialRampToValueAtTime(Math.max(32, th0 * 0.55), t + 0.14);

		thGain.gain.setValueAtTime(0.0001, t);
		thGain.gain.exponentialRampToValueAtTime(typeKey === 'stone' ? 0.22 : 0.18, t + 0.012);
		thGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);

		th.connect(thGain);
		thGain.connect(master);
		th.start(t);
		th.stop(t + 0.19);

		if (typeKey === 'grass') {
			const t2 = t + 0.01;
			const nn = ctx.createBufferSource();
			nn.buffer = noiseBuf;
			const g = ctx.createGain();
			const hp = ctx.createBiquadFilter();
			hp.type = 'highpass';
			hp.frequency.setValueAtTime(2200, t2);
			g.gain.setValueAtTime(0.0001, t2);
			g.gain.exponentialRampToValueAtTime(0.06, t2 + 0.005);
			g.gain.exponentialRampToValueAtTime(0.0001, t2 + 0.045);
			nn.connect(hp);
			hp.connect(g);
			g.connect(master);
			nn.start(t2);
			nn.stop(t2 + 0.05);
		}
	}

	private ensureEngine(): AudioEngine | null {
		if (this.engine) return this.engine;
		const Ctx = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
		if (!Ctx) return null;
		const ctx = new Ctx();
		const master = ctx.createGain();
		master.gain.value = 0.55;
		master.connect(ctx.destination);

		const noiseLen = Math.floor(ctx.sampleRate * 1.0);
		const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
		const data = noiseBuf.getChannelData(0);
		for (let i = 0; i < noiseLen; i++) data[i] = (Math.random() * 2 - 1) * 0.9;

		this.engine = { ctx, master, noiseBuf };
		return this.engine;
	}
}
