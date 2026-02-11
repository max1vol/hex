import * as THREE from 'three';

export interface TextureOptions {
	wrapS?: THREE.Wrapping;
	wrapT?: THREE.Wrapping;
	repeatX?: number;
	repeatY?: number;
	minFilter?: THREE.MinificationTextureFilter;
	magFilter?: THREE.MagnificationTextureFilter;
	generateMipmaps?: boolean;
}

export function configureTexture(
	renderer: THREE.WebGLRenderer,
	texture: THREE.Texture,
	opts: TextureOptions = {}
): THREE.Texture {
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.wrapS = opts.wrapS ?? THREE.ClampToEdgeWrapping;
	texture.wrapT = opts.wrapT ?? THREE.ClampToEdgeWrapping;
	texture.repeat.set(opts.repeatX ?? 1, opts.repeatY ?? 1);
	if (opts.minFilter) texture.minFilter = opts.minFilter;
	if (opts.magFilter) texture.magFilter = opts.magFilter;
	if (typeof opts.generateMipmaps === 'boolean') texture.generateMipmaps = opts.generateMipmaps;
	texture.anisotropy = Math.min(10, renderer.capabilities.getMaxAnisotropy());
	texture.needsUpdate = true;
	return texture;
}

export function loadTexture(
	renderer: THREE.WebGLRenderer,
	loader: THREE.TextureLoader,
	url: string,
	opts: TextureOptions = {}
): Promise<THREE.Texture> {
	return new Promise((resolve, reject) => {
		loader.load(
			url,
			(tex) => resolve(configureTexture(renderer, tex, opts)),
			undefined,
			(err) => reject(err ?? new Error(`Failed to load ${url}`))
		);
	});
}
