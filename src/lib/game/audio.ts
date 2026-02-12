import type { BiomeAmbience, BlockType, WeatherKind } from './types';

interface BgmTrack {
	url: string;
	volume: number;
}

type SurfaceTone = 'stone' | 'sand' | 'metal' | 'glass' | 'earth';

const TRACK_FOREST: BgmTrack = { url: '/audio/forest_ambience.mp3', volume: 0.48 };
const TRACK_DESERT: BgmTrack = { url: '/audio/desert_travel.ogg', volume: 0.42 };
const TRACK_SPACE: BgmTrack = { url: '/audio/outer_space.mp3', volume: 0.38 };
const TRACK_STONEHENGE: BgmTrack = { url: '/audio/stonehenge_drums.wav', volume: 0.5 };

const TRACK_BY_BIOME: Record<string, BgmTrack> = {
	'grassland-origins': TRACK_STONEHENGE,
	'ancient-egypt': TRACK_DESERT,
	'ice-age': TRACK_SPACE,
	'ancient-rome': TRACK_DESERT,
	'paris-industrial': TRACK_FOREST,
	'new-york-harbor': TRACK_FOREST,
	'london-westminster': TRACK_FOREST,
	'san-francisco-bay': TRACK_FOREST
};

export class HexWorldAudio {
	private muted = false;
	private unlocked = false;
	private weather: WeatherKind = 'clear';

	private readonly bgmCache = new Map<string, HTMLAudioElement>();
	private readonly fadingOut: HTMLAudioElement[] = [];
	private currentBgm: HTMLAudioElement | null = null;
	private bgmTargetVolume = TRACK_FOREST.volume;
	private pendingBgm: BgmTrack | null = TRACK_FOREST;
	private lastStepMs = 0;

	private currentBiomeId: string | null = null;
	private currentAmbience: BiomeAmbience | null = null;

	private readonly portalSfx = new Audio('/audio/portal.ogg');
	private sfxCtx: AudioContext | null = null;
	private breakNoise: AudioBuffer | null = null;

	constructor() {
		this.portalSfx.preload = 'auto';
		this.portalSfx.volume = 0.7;
	}

	unlock(): void {
		if (this.unlocked) return;
		this.unlocked = true;
		if (this.pendingBgm) {
			this.switchBgm(this.pendingBgm.url, this.pendingBgm.volume);
			this.pendingBgm = null;
		}
	}

	setMuted(next: boolean): void {
		this.muted = next;
		if (next) {
			if (this.currentBgm) this.currentBgm.volume = 0;
			for (const fading of this.fadingOut) fading.volume = 0;
			return;
		}
		this.unlock();
		if (this.currentBgm?.paused) void this.currentBgm.play().catch(() => {});
	}

	toggleMuted(): boolean {
		this.setMuted(!this.muted);
		return this.muted;
	}

	isMuted(): boolean {
		return this.muted;
	}

	setBiomeAmbience(ambience: BiomeAmbience, biomeId?: string): void {
		this.currentAmbience = ambience;
		if (typeof biomeId === 'string' && biomeId.length) this.currentBiomeId = biomeId;
		const track = this.pickTrack();
		this.switchBgm(track.url, track.volume);
	}

	setWeather(kind: WeatherKind): void {
		this.weather = kind;
	}

	step(nowMs: number, _daylight: number): void {
		if (!this.unlocked) return;
		if (this.currentBgm?.paused && !this.muted) {
			void this.currentBgm.play().catch(() => {});
		}

		if (!this.lastStepMs) this.lastStepMs = nowMs;
		const delta = Math.max(0.001, Math.min(1, (nowMs - this.lastStepMs) / 1000));
		this.lastStepMs = nowMs;

		const target = this.muted ? 0 : this.bgmTargetVolume;
		if (this.currentBgm) {
			this.currentBgm.volume += (target - this.currentBgm.volume) * Math.min(1, delta * 2.2);
		}

		for (let i = this.fadingOut.length - 1; i >= 0; i--) {
			const fading = this.fadingOut[i];
			fading.volume = Math.max(0, fading.volume - delta * 0.6);
			if (fading.volume <= 0.001) {
				fading.pause();
				fading.currentTime = 0;
				this.fadingOut.splice(i, 1);
			}
		}
	}

	playPortal(): void {
		if (this.muted || !this.unlocked) return;
		const instance = this.portalSfx.cloneNode(true) as HTMLAudioElement;
		instance.volume = this.portalSfx.volume;
		void instance.play().catch(() => {});
	}

	playQuizResult(ok: boolean): void {
		const ctx = this.ensureSfxContext();
		if (!ctx) return;
		const t = ctx.currentTime;
		const notes = ok ? [660, 880, 1108] : [320, 260, 190];
		for (let i = 0; i < notes.length; i++) {
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			const at = t + i * 0.06;
			osc.type = ok ? 'triangle' : 'sawtooth';
			osc.frequency.setValueAtTime(notes[i], at);
			gain.gain.setValueAtTime(0.0001, at);
			gain.gain.exponentialRampToValueAtTime(ok ? 0.12 : 0.1, at + 0.015);
			gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.14);
			osc.connect(gain);
			gain.connect(ctx.destination);
			osc.start(at);
			osc.stop(at + 0.16);
		}
	}

	playPlace(typeKey: BlockType): void {
		const ctx = this.ensureSfxContext();
		if (!ctx || !this.breakNoise) return;
		const tone = classifyTone(typeKey);
		const now = ctx.currentTime;

		const gain = ctx.createGain();
		const baseVolume =
			tone === 'glass' ? 0.06 : tone === 'stone' ? 0.08 : tone === 'sand' ? 0.07 : tone === 'metal' ? 0.082 : 0.075;
		gain.gain.setValueAtTime(0.0001, now);
		gain.gain.exponentialRampToValueAtTime(baseVolume, now + 0.004);
		gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.065);

		const filter = ctx.createBiquadFilter();
		filter.type = 'lowpass';
		const cutoff = tone === 'glass' ? 2400 : tone === 'stone' ? 1250 : tone === 'sand' ? 700 : tone === 'metal' ? 1700 : 900;
		filter.frequency.setValueAtTime(cutoff, now);
		filter.Q.setValueAtTime(0.7, now);

		const src = ctx.createBufferSource();
		src.buffer = this.breakNoise;
		const rate = tone === 'sand' ? 1.05 : tone === 'glass' ? 1.2 : tone === 'metal' ? 1.14 : 1.1;
		src.playbackRate.setValueAtTime(rate, now);
		src.connect(filter);
		filter.connect(gain);
		gain.connect(ctx.destination);
		src.start(now);
		src.stop(now + 0.08);
	}

	playBreak(typeKey: BlockType): void {
		const ctx = this.ensureSfxContext();
		if (!ctx || !this.breakNoise) return;
		const tone = classifyTone(typeKey);
		const now = ctx.currentTime;

		const gain = ctx.createGain();
		const baseVolume =
			tone === 'glass'
				? 0.085
				: tone === 'stone'
					? 0.12
					: tone === 'sand'
						? 0.095
						: tone === 'metal'
							? 0.11
							: 0.105;
		gain.gain.setValueAtTime(0.0001, now);
		gain.gain.exponentialRampToValueAtTime(baseVolume, now + 0.008);
		gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);

		const filter = ctx.createBiquadFilter();
		filter.type = 'bandpass';
		const centerFreq =
			tone === 'glass' ? 1450 : tone === 'stone' ? 720 : tone === 'sand' ? 520 : tone === 'metal' ? 980 : 420;
		filter.frequency.setValueAtTime(centerFreq, now);
		filter.Q.setValueAtTime(0.9, now);

		const src = ctx.createBufferSource();
		src.buffer = this.breakNoise;
		const rate = tone === 'sand' ? 0.85 : tone === 'metal' ? 0.96 : 1;
		src.playbackRate.setValueAtTime(rate, now);
		src.connect(filter);
		filter.connect(gain);
		gain.connect(ctx.destination);
		src.start(now);
		src.stop(now + 0.16);

		const tickOsc = ctx.createOscillator();
		tickOsc.type = tone === 'stone' ? 'triangle' : 'sine';
		const tickFreq = tone === 'glass' ? 1220 : tone === 'stone' ? 230 : tone === 'sand' ? 520 : tone === 'metal' ? 420 : 360;
		tickOsc.frequency.setValueAtTime(tickFreq, now);
		const tickGain = ctx.createGain();
		tickGain.gain.setValueAtTime(0.0001, now);
		tickGain.gain.exponentialRampToValueAtTime(baseVolume * 0.65, now + 0.006);
		tickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
		tickOsc.connect(tickGain);
		tickGain.connect(ctx.destination);
		tickOsc.start(now);
		tickOsc.stop(now + 0.07);
	}

	dispose(): void {
		if (this.currentBgm) {
			this.currentBgm.pause();
			this.currentBgm.currentTime = 0;
		}
		for (const audio of this.fadingOut) {
			audio.pause();
			audio.currentTime = 0;
		}
		this.fadingOut.length = 0;
		for (const audio of this.bgmCache.values()) {
			audio.pause();
			audio.currentTime = 0;
		}
		this.bgmCache.clear();
		this.currentBgm = null;
		if (this.sfxCtx) void this.sfxCtx.close();
		this.sfxCtx = null;
		this.breakNoise = null;
	}

	private pickTrack(): BgmTrack {
		if (this.currentBiomeId && TRACK_BY_BIOME[this.currentBiomeId]) {
			return TRACK_BY_BIOME[this.currentBiomeId];
		}
		if (this.currentAmbience?.weatherPool.includes('snow')) return TRACK_SPACE;
		if (this.currentAmbience?.weatherPool.includes('mist') && !this.currentAmbience.weatherPool.includes('rain')) {
			return TRACK_DESERT;
		}
		return TRACK_FOREST;
	}

	private switchBgm(url: string, volume: number): void {
		this.bgmTargetVolume = volume;
		this.pendingBgm = { url, volume };
		if (!this.unlocked) return;

		const next = this.getBgm(url);
		if (this.currentBgm === next) return;

		if (this.currentBgm) this.fadingOut.push(this.currentBgm);
		this.currentBgm = next;
		this.currentBgm.currentTime = 0;
		this.currentBgm.volume = 0;
		if (!this.muted) void this.currentBgm.play().catch(() => {});
	}

	private getBgm(url: string): HTMLAudioElement {
		const cached = this.bgmCache.get(url);
		if (cached) return cached;
		const audio = new Audio(url);
		audio.loop = true;
		audio.volume = 0;
		audio.preload = 'auto';
		this.bgmCache.set(url, audio);
		return audio;
	}

	private ensureSfxContext(): AudioContext | null {
		if (!this.unlocked || this.muted) return null;
		const Ctor: typeof AudioContext | undefined =
			window.AudioContext ??
			(window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
		if (!Ctor) return null;

		if (!this.sfxCtx) {
			this.sfxCtx = new Ctor();
			const length = Math.floor(this.sfxCtx.sampleRate * 0.14);
			this.breakNoise = this.sfxCtx.createBuffer(1, length, this.sfxCtx.sampleRate);
			const data = this.breakNoise.getChannelData(0);
			for (let i = 0; i < length; i++) {
				const t = i / Math.max(1, length - 1);
				const env = Math.pow(1 - t, 2.25);
				data[i] = (Math.random() * 2 - 1) * env;
			}
		}

		if (this.sfxCtx.state === 'suspended') void this.sfxCtx.resume().catch(() => {});
		return this.sfxCtx;
	}
}

function classifyTone(typeKey: BlockType): SurfaceTone {
	switch (typeKey) {
		case 'stone':
		case 'bedrock':
		case 'brick':
		case 'asphalt':
			return 'stone';
		case 'sand':
			return 'sand';
		case 'metal':
			return 'metal';
		case 'timber':
		case 'thatch':
		case 'fire':
			return 'earth';
		case 'ice':
		case 'water':
			return 'glass';
		default:
			return 'earth';
	}
}
