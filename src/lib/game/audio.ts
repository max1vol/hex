import type { BiomeAmbience, BlockType, WeatherKind } from './types';

interface AudioEngine {
	ctx: AudioContext;
	master: GainNode;
	musicBus: GainNode;
	sfxBus: GainNode;
	weatherBus: GainNode;
	noiseBuf: AudioBuffer;
	musicOscA: OscillatorNode;
	musicOscB: OscillatorNode;
	musicGainA: GainNode;
	musicGainB: GainNode;
	weatherNoise: AudioBufferSourceNode;
	weatherFilter: BiquadFilterNode;
	weatherGain: GainNode;
}

interface MusicState {
	root: number;
	accent: number;
	tempoBpm: number;
	lastPulseMs: number;
}

export class HexWorldAudio {
	private muted = false;
	private engine: AudioEngine | null = null;
	private readonly music: MusicState = {
		root: 220,
		accent: 330,
		tempoBpm: 88,
		lastPulseMs: 0
	};
	private weather: WeatherKind = 'clear';

	setMuted(next: boolean): void {
		this.muted = next;
		if (this.engine) {
			this.engine.master.gain.setTargetAtTime(next ? 0.0001 : 0.75, this.engine.ctx.currentTime, 0.05);
		}
	}

	toggleMuted(): boolean {
		this.setMuted(!this.muted);
		return this.muted;
	}

	isMuted(): boolean {
		return this.muted;
	}

	setBiomeAmbience(ambience: BiomeAmbience): void {
		this.music.root = ambience.musicRoot;
		this.music.accent = ambience.musicAccent;
		this.music.tempoBpm = ambience.tempoBpm;
		const a = this.ensureEngine();
		if (!a) return;
		const t = a.ctx.currentTime;
		a.musicOscA.frequency.setTargetAtTime(this.music.root, t, 0.45);
		a.musicOscB.frequency.setTargetAtTime(this.music.accent, t, 0.45);
	}

	setWeather(kind: WeatherKind): void {
		this.weather = kind;
		const a = this.ensureEngine();
		if (!a) return;
		const t = a.ctx.currentTime;

		let gain = 0.0001;
		let freq = 1400;
		let q = 0.6;
		if (kind === 'rain') {
			gain = 0.2;
			freq = 1600;
			q = 0.8;
		} else if (kind === 'snow') {
			gain = 0.14;
			freq = 1000;
			q = 0.55;
		} else if (kind === 'mist') {
			gain = 0.08;
			freq = 700;
			q = 0.35;
		}

		a.weatherFilter.frequency.setTargetAtTime(freq, t, 0.3);
		a.weatherFilter.Q.setTargetAtTime(q, t, 0.3);
		a.weatherGain.gain.setTargetAtTime(gain, t, 0.4);
	}

	step(nowMs: number, daylight: number): void {
		if (this.muted) return;
		const a = this.ensureEngine();
		if (!a) return;
		void a.ctx.resume();
		const t = a.ctx.currentTime;

		const bright = Math.max(0.08, daylight);
		a.musicGainA.gain.setTargetAtTime(0.11 * bright, t, 0.18);
		a.musicGainB.gain.setTargetAtTime(0.085 * (0.35 + bright), t, 0.16);

		const pulseEveryMs = (60 / Math.max(40, this.music.tempoBpm)) * 1000;
		if (nowMs - this.music.lastPulseMs >= pulseEveryMs) {
			this.music.lastPulseMs = nowMs;
			this.playPulse(t, daylight);
		}
	}

	playPortal(): void {
		if (this.muted) return;
		const a = this.ensureEngine();
		if (!a) return;
		const t = a.ctx.currentTime;
		for (let i = 0; i < 3; i++) {
			const o = a.ctx.createOscillator();
			const g = a.ctx.createGain();
			o.type = 'sine';
			const start = t + i * 0.06;
			o.frequency.setValueAtTime(360 + i * 90, start);
			o.frequency.exponentialRampToValueAtTime(540 + i * 110, start + 0.16);
			g.gain.setValueAtTime(0.0001, start);
			g.gain.exponentialRampToValueAtTime(0.16, start + 0.02);
			g.gain.exponentialRampToValueAtTime(0.0001, start + 0.2);
			o.connect(g);
			g.connect(a.sfxBus);
			o.start(start);
			o.stop(start + 0.24);
		}
	}

	playQuizResult(ok: boolean): void {
		if (this.muted) return;
		const a = this.ensureEngine();
		if (!a) return;
		const t = a.ctx.currentTime;
		const notes = ok ? [330, 440, 554] : [290, 240, 190];
		notes.forEach((f, i) => {
			const o = a.ctx.createOscillator();
			const g = a.ctx.createGain();
			o.type = ok ? 'triangle' : 'sawtooth';
			const at = t + i * 0.07;
			o.frequency.setValueAtTime(f, at);
			g.gain.setValueAtTime(0.0001, at);
			g.gain.exponentialRampToValueAtTime(ok ? 0.18 : 0.12, at + 0.015);
			g.gain.exponentialRampToValueAtTime(0.0001, at + 0.15);
			o.connect(g);
			g.connect(a.sfxBus);
			o.start(at);
			o.stop(at + 0.17);
		});
	}

	playPlace(typeKey: BlockType): void {
		if (this.muted) return;
		const a = this.ensureEngine();
		if (!a) return;
		const { ctx, sfxBus, noiseBuf } = a;
		void ctx.resume();
		const t = ctx.currentTime;

		const tone = ctx.createOscillator();
		const toneGain = ctx.createGain();
		const toneFilter = ctx.createBiquadFilter();
		tone.type = 'triangle';

		let base = 220;
		if (typeKey === 'stone' || typeKey === 'bedrock') base = 180;
		if (typeKey === 'sand') base = 260;
		if (typeKey === 'grass') base = 240;
		if (typeKey === 'metal') base = 320;
		base *= 1 + (Math.random() * 0.08 - 0.04);

		tone.frequency.setValueAtTime(base, t);
		tone.frequency.exponentialRampToValueAtTime(Math.max(60, base * 0.55), t + 0.07);
		toneFilter.type = 'lowpass';
		toneFilter.frequency.setValueAtTime(9000, t);
		toneFilter.frequency.exponentialRampToValueAtTime(typeKey === 'metal' ? 4200 : 2200, t + 0.06);

		toneGain.gain.setValueAtTime(0.0001, t);
		toneGain.gain.exponentialRampToValueAtTime(typeKey === 'metal' ? 0.26 : 0.22, t + 0.005);
		toneGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);

		tone.connect(toneFilter);
		toneFilter.connect(toneGain);
		toneGain.connect(sfxBus);
		tone.start(t);
		tone.stop(t + 0.11);

		const n = ctx.createBufferSource();
		n.buffer = noiseBuf;
		const nGain = ctx.createGain();
		const nFilter = ctx.createBiquadFilter();
		nFilter.type = 'bandpass';
		nFilter.frequency.setValueAtTime(typeKey === 'sand' ? 1100 : typeKey === 'metal' ? 2600 : 1900, t);
		nFilter.Q.setValueAtTime(typeKey === 'stone' ? 0.9 : 0.7, t);

		nGain.gain.setValueAtTime(0.0001, t);
		nGain.gain.exponentialRampToValueAtTime(typeKey === 'stone' ? 0.1 : 0.07, t + 0.004);
		nGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);

		n.connect(nFilter);
		nFilter.connect(nGain);
		nGain.connect(sfxBus);
		n.start(t);
		n.stop(t + 0.04);
	}

	playBreak(typeKey: BlockType): void {
		if (this.muted) return;
		const a = this.ensureEngine();
		if (!a) return;
		const { ctx, sfxBus, noiseBuf } = a;
		void ctx.resume();
		const t = ctx.currentTime;

		const n = ctx.createBufferSource();
		n.buffer = noiseBuf;
		const nGain = ctx.createGain();
		const nFilter = ctx.createBiquadFilter();
		nFilter.type = 'bandpass';
		const f0 = typeKey === 'stone' || typeKey === 'bedrock' ? 1800 : typeKey === 'sand' ? 900 : 1400;
		const f1 = typeKey === 'stone' || typeKey === 'bedrock' ? 700 : typeKey === 'sand' ? 420 : 540;
		nFilter.frequency.setValueAtTime(f0, t);
		nFilter.frequency.exponentialRampToValueAtTime(f1, t + 0.16);
		nFilter.Q.setValueAtTime(typeKey === 'stone' || typeKey === 'bedrock' ? 1.15 : 0.9, t);

		nGain.gain.setValueAtTime(0.0001, t);
		nGain.gain.exponentialRampToValueAtTime(typeKey === 'stone' ? 0.34 : 0.26, t + 0.01);
		nGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);

		n.connect(nFilter);
		nFilter.connect(nGain);
		nGain.connect(sfxBus);
		n.start(t);
		n.stop(t + 0.22);

		const th = ctx.createOscillator();
		const thGain = ctx.createGain();
		th.type = typeKey === 'stone' || typeKey === 'bedrock' ? 'sine' : 'triangle';
		const th0 = (typeKey === 'stone' ? 92 : typeKey === 'sand' ? 70 : 80) * (1 + (Math.random() * 0.06 - 0.03));
		th.frequency.setValueAtTime(th0, t);
		th.frequency.exponentialRampToValueAtTime(Math.max(32, th0 * 0.55), t + 0.14);

		thGain.gain.setValueAtTime(0.0001, t);
		thGain.gain.exponentialRampToValueAtTime(typeKey === 'stone' ? 0.22 : 0.18, t + 0.012);
		thGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);

		th.connect(thGain);
		thGain.connect(sfxBus);
		th.start(t);
		th.stop(t + 0.19);
	}

	private playPulse(t: number, daylight: number): void {
		if (!this.engine) return;
		const g = this.engine.ctx.createGain();
		const o = this.engine.ctx.createOscillator();
		o.type = 'sine';
		const accent = daylight > 0.5 ? this.music.accent : this.music.root * 0.75;
		o.frequency.setValueAtTime(accent, t);
		g.gain.setValueAtTime(0.0001, t);
		g.gain.exponentialRampToValueAtTime(0.14, t + 0.01);
		g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
		o.connect(g);
		g.connect(this.engine.musicBus);
		o.start(t);
		o.stop(t + 0.18);
	}

	private ensureEngine(): AudioEngine | null {
		if (this.engine) return this.engine;
		const Ctx =
			window.AudioContext ??
			(window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
		if (!Ctx) return null;
		const ctx = new Ctx();

		const master = ctx.createGain();
		master.gain.value = this.muted ? 0.0001 : 0.75;
		master.connect(ctx.destination);

		const musicBus = ctx.createGain();
		musicBus.gain.value = 0.8;
		musicBus.connect(master);

		const sfxBus = ctx.createGain();
		sfxBus.gain.value = 0.85;
		sfxBus.connect(master);

		const weatherBus = ctx.createGain();
		weatherBus.gain.value = 0.52;
		weatherBus.connect(master);

		const noiseLen = Math.floor(ctx.sampleRate * 1.0);
		const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
		const data = noiseBuf.getChannelData(0);
		for (let i = 0; i < noiseLen; i++) data[i] = (Math.random() * 2 - 1) * 0.9;

		const musicOscA = ctx.createOscillator();
		const musicOscB = ctx.createOscillator();
		const musicGainA = ctx.createGain();
		const musicGainB = ctx.createGain();
		musicOscA.type = 'triangle';
		musicOscB.type = 'sine';
		musicOscA.frequency.value = this.music.root;
		musicOscB.frequency.value = this.music.accent;
		musicGainA.gain.value = 0.08;
		musicGainB.gain.value = 0.06;
		musicOscA.connect(musicGainA);
		musicOscB.connect(musicGainB);
		musicGainA.connect(musicBus);
		musicGainB.connect(musicBus);
		musicOscA.start();
		musicOscB.start();

		const weatherNoise = ctx.createBufferSource();
		weatherNoise.buffer = noiseBuf;
		weatherNoise.loop = true;
		const weatherFilter = ctx.createBiquadFilter();
		weatherFilter.type = 'bandpass';
		weatherFilter.frequency.value = 1200;
		weatherFilter.Q.value = 0.6;
		const weatherGain = ctx.createGain();
		weatherGain.gain.value = 0.0001;
		weatherNoise.connect(weatherFilter);
		weatherFilter.connect(weatherGain);
		weatherGain.connect(weatherBus);
		weatherNoise.start();

		this.engine = {
			ctx,
			master,
			musicBus,
			sfxBus,
			weatherBus,
			noiseBuf,
			musicOscA,
			musicOscB,
			musicGainA,
			musicGainB,
			weatherNoise,
			weatherFilter,
			weatherGain
		};
		this.setWeather(this.weather);
		return this.engine;
	}
}
