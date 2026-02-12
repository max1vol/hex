import type { BiomeManifest, QuizQuestion } from './types';

function q(
	id: string,
	prompt: string,
	options: string[],
	correctIndex: number,
	explanation: string
): QuizQuestion {
	return { id, prompt, options, correctIndex, explanation };
}

export const BIOMES: BiomeManifest[] = [
	{
		id: 'grassland-origins',
		place: 'Stonehenge Ritual Plain',
		eraLabel: 'Late Neolithic Britain',
		yearLabel: 'c. 2500 BCE',
		description: 'A vast active Stonehenge landscape with processional avenues, hearth villages, and pasture.',
		radius: 64,
		seaLevel: 6,
		heightBoost: 9,
		noiseScale: 0.88,
		palette: ['grass', 'dirt', 'stone', 'sand', 'water', 'bedrock'],
		blockSet: {
			surface: 'grass',
			subsurface: 'dirt',
			deep: 'stone',
			shore: 'sand',
			water: 'water',
			bedrock: 'bedrock'
		},
		ambience: {
			skyDayTop: 0x9ab9dc,
			skyDayBottom: 0xd6e8f4,
			skyNightTop: 0x101b34,
			skyNightBottom: 0x1f3454,
			fogColor: 0xb3c6cf,
			fogDensity: 0.016,
			sunColor: 0xffefcb,
			weatherPool: ['clear', 'mist', 'rain'],
			musicRoot: 196,
			musicAccent: 294,
			tempoBpm: 82
		},
		portalRequirement: { mode: 'quiz', minCorrect: 1 },
		portalLinks: [
			{ toBiome: 'ancient-egypt', label: 'Egypt Portal', anchor: 'north', requirement: 'quiz' },
			{ toBiome: 'london-westminster', label: 'London Portal', anchor: 'east', requirement: 'quiz' },
			{ toBiome: 'san-francisco-bay', label: 'San Francisco Portal', anchor: 'west', requirement: 'quiz' }
		],
		learningGoals: [
			'Identify Stonehenge as a Neolithic ceremonial site built from megalith stones.',
			'Recognize that people gathered seasonally for rituals, feasts, and trade.',
			'Connect henge monuments, avenue routes, and nearby settlements in one landscape.'
		],
		interactiveTasks: [
			'Rebuild missing lintel stones on the outer ring.',
			'Follow the processional avenue from heel stone to the central circle.',
			'Repair roundhouse hearth walls in the nearby settlement.'
		],
		landmarkKits: ['Stonehenge ring', 'Heel stone avenue', 'Roundhouse village'],
		quizzes: [
			q(
				'sh-megalith',
				'What are the huge upright stones in this biome called?',
				['Megaliths', 'Skyscrapers', 'Satellites'],
				0,
				'Megalith means a very large stone used in ancient monuments.'
			),
			q(
				'sh-era',
				'Stonehenge Ritual Plain represents which era?',
				['Late Neolithic Britain', 'Industrial Revolution', 'Roman Empire'],
				0,
				'Stonehenge belongs to late Neolithic and early Bronze Age Britain.'
			),
			q(
				'sh-avenue',
				'What path leads toward the stone circle in this biome?',
				['A processional avenue', 'A railway line', 'A motorway'],
				0,
				'The processional avenue guided movement to ceremonial spaces.'
			)
		]
	},
	{
		id: 'ancient-egypt',
		place: 'Ancient Egypt',
		eraLabel: 'Old Kingdom Egypt',
		yearLabel: 'c. 2500 BCE',
		description: 'Sandy Nile-inspired biome with a climbable pyramid build zone.',
		radius: 40,
		seaLevel: 6,
		heightBoost: 5,
		noiseScale: 0.86,
		palette: ['sand', 'stone', 'dirt', 'water', 'bedrock', 'brick'],
		blockSet: {
			surface: 'sand',
			subsurface: 'dirt',
			deep: 'stone',
			shore: 'sand',
			water: 'water',
			bedrock: 'bedrock'
		},
		ambience: {
			skyDayTop: 0xf7d38a,
			skyDayBottom: 0xf9e1b1,
			skyNightTop: 0x221a2f,
			skyNightBottom: 0x392a4b,
			fogColor: 0xd8b77f,
			fogDensity: 0.012,
			sunColor: 0xffd993,
			weatherPool: ['clear', 'mist'],
			musicRoot: 196,
			musicAccent: 294,
			tempoBpm: 78
		},
		portalRequirement: { mode: 'quiz', minCorrect: 1 },
		portalLinks: [
			{ toBiome: 'grassland-origins', label: 'Return To Grasslands', anchor: 'south', requirement: 'quiz' },
			{ toBiome: 'ice-age', label: 'Ice Age Portal', anchor: 'northEast', requirement: 'quiz' }
		],
		learningGoals: [
			'Know pyramids were built in ancient Egypt as royal tombs.',
			'Identify the Nile as a major river supporting farming.',
			'Understand workers used ramps and teamwork for construction.'
		],
		interactiveTasks: [
			'Complete missing pyramid steps using sand/stone.',
			'Rebuild a short riverbank canal.',
			'Find carved markers near the Big Sphinx wall.'
		],
		landmarkKits: ['Great Pyramid', 'Sphinx-style statue', 'Canal paths'],
		quizzes: [
			q(
				'eg-pyramid',
				'What famous shape dominates this biome?',
				['Pyramid', 'Skyscraper', 'Ferris wheel'],
				0,
				'Ancient Egypt is known for pyramid structures.'
			),
			q(
				'eg-river',
				'Which river helped ancient Egypt grow?',
				['Nile', 'Thames', 'Seine'],
				0,
				'The Nile made farming possible in desert regions.'
			),
			q(
				'eg-stone',
				'What helped move heavy stones for giant builds?',
				['Ramps and teams', 'Jet engines', 'Rubber tires'],
				0,
				'Ramps and coordinated labor were key methods.'
			)
		]
	},
	{
		id: 'ice-age',
		place: 'Ice Age Tundra',
		eraLabel: 'Last Glacial Maximum',
		yearLabel: 'c. 20,000 BCE',
		description: 'Frozen valleys with glaciers, snow ridges, and mammoth routes.',
		radius: 42,
		seaLevel: 5,
		heightBoost: 10,
		noiseScale: 1.06,
		palette: ['snow', 'ice', 'stone', 'water', 'bedrock', 'dirt'],
		blockSet: {
			surface: 'snow',
			subsurface: 'ice',
			deep: 'stone',
			shore: 'snow',
			water: 'water',
			bedrock: 'bedrock'
		},
		ambience: {
			skyDayTop: 0x9ec8f7,
			skyDayBottom: 0xd8ecff,
			skyNightTop: 0x08162d,
			skyNightBottom: 0x133864,
			fogColor: 0xdce9f6,
			fogDensity: 0.02,
			sunColor: 0xecf5ff,
			weatherPool: ['clear', 'snow', 'mist'],
			musicRoot: 175,
			musicAccent: 262,
			tempoBpm: 72
		},
		portalRequirement: { mode: 'quiz', minCorrect: 1 },
		portalLinks: [
			{ toBiome: 'ancient-egypt', label: 'Egypt Portal', anchor: 'southWest', requirement: 'quiz' },
			{ toBiome: 'ancient-rome', label: 'Rome Portal', anchor: 'east', requirement: 'quiz' }
		],
		learningGoals: [
			'Know the Ice Age was much colder than today.',
			'Recognize glaciers shape valleys and terrain.',
			'Identify simple survival needs in cold climates.'
		],
		interactiveTasks: [
			'Rebuild an ice bridge across a frozen stream.',
			'Follow mammoth trail markers to a cave camp.',
			'Collect snow blocks to insulate a shelter.'
		],
		landmarkKits: ['Glacier wall', 'Ice cave', 'Mammoth track route'],
		quizzes: [
			q(
				'ia-temp',
				'How was the climate in the Ice Age compared with today?',
				['Much colder', 'Much hotter', 'Exactly the same'],
				0,
				'Large ice sheets show the climate was much colder.'
			),
			q(
				'ia-glacier',
				'What carved broad valleys in this biome?',
				['Glaciers', 'Cars', 'Volcano ash'],
				0,
				'Moving glaciers can carve large valleys over time.'
			),
			q(
				'ia-ground',
				'Which surface block is most common here?',
				['Snow', 'Brick', 'Grass'],
				0,
				'Snow covers most exposed terrain in this biome.'
			)
		]
	},
	{
		id: 'ancient-rome',
		place: 'Ancient Rome',
		eraLabel: 'Roman Empire',
		yearLabel: 'c. 80 CE',
		description: 'Forum district with Colosseum ring and stone roads.',
		radius: 36,
		seaLevel: 6,
		heightBoost: 6,
		noiseScale: 0.88,
		palette: ['brick', 'stone', 'sand', 'grass', 'water', 'bedrock'],
		blockSet: {
			surface: 'sand',
			subsurface: 'dirt',
			deep: 'stone',
			shore: 'sand',
			water: 'water',
			bedrock: 'bedrock'
		},
		ambience: {
			skyDayTop: 0xa8c0e0,
			skyDayBottom: 0xe1edff,
			skyNightTop: 0x0f1a36,
			skyNightBottom: 0x2f3c62,
			fogColor: 0xc8d1dc,
			fogDensity: 0.014,
			sunColor: 0xffebc8,
			weatherPool: ['clear', 'rain', 'mist'],
			musicRoot: 208,
			musicAccent: 312,
			tempoBpm: 84
		},
		portalRequirement: { mode: 'quiz', minCorrect: 1 },
		portalLinks: [
			{ toBiome: 'ice-age', label: 'Ice Age Portal', anchor: 'west', requirement: 'quiz' },
			{ toBiome: 'paris-industrial', label: 'Paris Portal', anchor: 'north', requirement: 'quiz' }
		],
		learningGoals: [
			'Identify amphitheaters as Roman public venues.',
			'Recognize Roman road engineering.',
			'Connect empire-era architecture with stone and arches.'
		],
		interactiveTasks: [
			'Repair gaps in the Colosseum outer ring.',
			'Complete a road segment to the forum square.',
			'Place support pillars under a broken arch.'
		],
		landmarkKits: ['Colosseum', 'Forum', 'Stone arches'],
		quizzes: [
			q(
				'ro-col',
				'What circular landmark stands in this biome?',
				['Colosseum', 'Pyramid', 'Clock tower'],
				0,
				'The Colosseum is a famous Roman amphitheater.'
			),
			q(
				'ro-road',
				'Romans were especially known for building strong...',
				['Roads', 'Submarines', 'Skate parks'],
				0,
				'Roman roads connected towns and armies efficiently.'
			),
			q(
				'ro-mat',
				'Which block is often used for Roman walls here?',
				['Brick', 'Ice', 'Water'],
				0,
				'Brick and stone are the main materials in this district.'
			)
		]
	},
	{
		id: 'paris-industrial',
		place: 'Paris Industrial Age',
		eraLabel: 'Belle Epoque Engineering',
		yearLabel: '1889 CE',
		description: 'A city biome featuring an Eiffel-style iron tower and boulevards.',
		radius: 34,
		seaLevel: 7,
		heightBoost: 5,
		noiseScale: 0.82,
		palette: ['asphalt', 'brick', 'metal', 'stone', 'water', 'bedrock'],
		blockSet: {
			surface: 'asphalt',
			subsurface: 'stone',
			deep: 'stone',
			shore: 'sand',
			water: 'water',
			bedrock: 'bedrock'
		},
		ambience: {
			skyDayTop: 0x99b7d9,
			skyDayBottom: 0xd5e5f3,
			skyNightTop: 0x12142c,
			skyNightBottom: 0x2f325b,
			fogColor: 0xafbfd0,
			fogDensity: 0.016,
			sunColor: 0xffe8bc,
			weatherPool: ['clear', 'rain', 'mist'],
			musicRoot: 247,
			musicAccent: 370,
			tempoBpm: 92
		},
		portalRequirement: { mode: 'quiz', minCorrect: 1 },
		portalLinks: [
			{ toBiome: 'ancient-rome', label: 'Rome Portal', anchor: 'south', requirement: 'quiz' },
			{ toBiome: 'new-york-harbor', label: 'New York Portal', anchor: 'west', requirement: 'quiz' }
		],
		learningGoals: [
			'Know the Eiffel Tower was built for 1889 exposition.',
			'Observe industrial-era metal construction.',
			'Compare old stone and newer metal architecture.'
		],
		interactiveTasks: [
			'Restore one lower tower support leg.',
			'Clear and repave a boulevard section.',
			'Light up tower beacons with metal blocks.'
		],
		landmarkKits: ['Eiffel-style tower', 'City boulevard', 'River embankment'],
		quizzes: [
			q(
				'pa-year',
				'The Eiffel-style tower here represents which year?',
				['1889', '1066', '2020'],
				0,
				'1889 marks the major Paris exposition era.'
			),
			q(
				'pa-mat',
				'What material is used most in the tower frame?',
				['Metal', 'Ice', 'Sand'],
				0,
				'The structure uses metal framing blocks.'
			),
			q(
				'pa-road',
				'What kind of paths run through this city biome?',
				['Boulevards', 'Glaciers', 'Dunes'],
				0,
				'Wide boulevards are a key city feature.'
			)
		]
	},
	{
		id: 'new-york-harbor',
		place: 'New York Harbor',
		eraLabel: 'Harbor Immigration Era',
		yearLabel: '1886 CE',
		description: 'Harbor island with statue platform, piers, and skyline hints.',
		radius: 36,
		seaLevel: 8,
		heightBoost: 4,
		noiseScale: 0.84,
		palette: ['asphalt', 'metal', 'brick', 'water', 'sand', 'bedrock'],
		blockSet: {
			surface: 'asphalt',
			subsurface: 'stone',
			deep: 'stone',
			shore: 'sand',
			water: 'water',
			bedrock: 'bedrock'
		},
		ambience: {
			skyDayTop: 0x82b7de,
			skyDayBottom: 0xd4e8f7,
			skyNightTop: 0x071731,
			skyNightBottom: 0x153c5f,
			fogColor: 0x99bdd8,
			fogDensity: 0.02,
			sunColor: 0xfff1ce,
			weatherPool: ['clear', 'rain', 'mist'],
			musicRoot: 233,
			musicAccent: 349,
			tempoBpm: 94
		},
		portalRequirement: { mode: 'quiz', minCorrect: 1 },
		portalLinks: [
			{ toBiome: 'paris-industrial', label: 'Paris Portal', anchor: 'east', requirement: 'quiz' },
			{ toBiome: 'london-westminster', label: 'London Portal', anchor: 'northEast', requirement: 'quiz' }
		],
		learningGoals: [
			'Know the Statue of Liberty was dedicated in 1886.',
			'Understand harbors as trade and migration hubs.',
			'Identify island and bridge logistics.'
		],
		interactiveTasks: [
			'Repair ferry pier steps.',
			'Rebuild a short seawall section.',
			'Light a harbor guide marker at night.'
		],
		landmarkKits: ['Statue pedestal', 'Harbor piers', 'Ferry route'],
		quizzes: [
			q(
				'ny-statue',
				'Which landmark inspired the main island statue area?',
				['Statue of Liberty', 'Big Ben', 'Colosseum'],
				0,
				'The harbor build is inspired by the Statue of Liberty site.'
			),
			q(
				'ny-year',
				'Which year appears for this harbor era?',
				['1886', '2500 BCE', '80 CE'],
				0,
				'1886 is the key year for this landmark context.'
			),
			q(
				'ny-water',
				'Why are piers useful in a harbor?',
				['They let boats dock safely', 'They melt snow', 'They grow crops'],
				0,
				'Piers provide docking access for boats and ferries.'
			)
		]
	},
	{
		id: 'london-westminster',
		place: 'London Westminster',
		eraLabel: 'Victorian London',
		yearLabel: '1859 CE',
		description: 'Westminster district with Parliament buildings and a Big Ben tower.',
		radius: 40,
		seaLevel: 7,
		heightBoost: 4,
		noiseScale: 0.8,
		palette: ['brick', 'stone', 'asphalt', 'metal', 'water', 'bedrock'],
		blockSet: {
			surface: 'asphalt',
			subsurface: 'stone',
			deep: 'stone',
			shore: 'sand',
			water: 'water',
			bedrock: 'bedrock'
		},
		ambience: {
			skyDayTop: 0x88a9c7,
			skyDayBottom: 0xd4deea,
			skyNightTop: 0x0b152a,
			skyNightBottom: 0x20355a,
			fogColor: 0xa5b6c5,
			fogDensity: 0.02,
			sunColor: 0xffefca,
			weatherPool: ['clear', 'rain', 'mist'],
			musicRoot: 196,
			musicAccent: 294,
			tempoBpm: 88
		},
		portalRequirement: { mode: 'quiz', minCorrect: 1 },
		portalLinks: [
			{ toBiome: 'grassland-origins', label: 'Grasslands Portal', anchor: 'west', requirement: 'quiz' },
			{ toBiome: 'new-york-harbor', label: 'New York Portal', anchor: 'north', requirement: 'quiz' },
			{ toBiome: 'san-francisco-bay', label: 'San Francisco Portal', anchor: 'south', requirement: 'quiz' }
		],
		learningGoals: [
			'Identify Parliament buildings as part of UK government.',
			'Recognize Big Ben as the famous clock tower.',
			'Link riverfront city planning to transport.'
		],
		interactiveTasks: [
			'Repair one Westminster bridge lane.',
			'Restore tower clock rim blocks.',
			'Connect Parliament wing corridors.'
		],
		landmarkKits: ['Parliament halls', 'Big Ben tower', 'Riverside road'],
		quizzes: [
			q(
				'lo-clock',
				'Which tower landmark stands beside Parliament here?',
				['Big Ben', 'Eiffel Tower', 'Sphinx'],
				0,
				'Big Ben is the famous clock tower in this district.'
			),
			q(
				'lo-gov',
				'What do Parliament buildings represent?',
				['Government and law making', 'A sports stadium', 'A shopping mall'],
				0,
				'Parliament is where laws are debated and made.'
			),
			q(
				'lo-river',
				'Why is the riverside useful for a city?',
				['Transport and trade', 'It only changes colors', 'It stops the sun'],
				0,
				'Rivers help transport people and goods.'
			)
		]
	},
	{
		id: 'san-francisco-bay',
		place: 'San Francisco Bay',
		eraLabel: 'Bridge & Bay City Era',
		yearLabel: '1937 CE',
		description:
			'Large coastal biome with Golden Gate bridge span, steep streets, and mural-lined blocks.',
		radius: 44,
		seaLevel: 8,
		heightBoost: 8,
		noiseScale: 1.08,
		palette: ['asphalt', 'brick', 'metal', 'art', 'water', 'bedrock', 'grass'],
		blockSet: {
			surface: 'grass',
			subsurface: 'dirt',
			deep: 'stone',
			shore: 'sand',
			water: 'water',
			bedrock: 'bedrock'
		},
		ambience: {
			skyDayTop: 0x7eb2dc,
			skyDayBottom: 0xd8ecff,
			skyNightTop: 0x081430,
			skyNightBottom: 0x17355f,
			fogColor: 0x9fc2dd,
			fogDensity: 0.018,
			sunColor: 0xffefc0,
			weatherPool: ['clear', 'rain', 'mist'],
			musicRoot: 262,
			musicAccent: 392,
			tempoBpm: 96
		},
		portalRequirement: { mode: 'quiz', minCorrect: 1 },
		portalLinks: [
			{ toBiome: 'grassland-origins', label: 'Grasslands Portal', anchor: 'east', requirement: 'quiz' },
			{ toBiome: 'london-westminster', label: 'London Portal', anchor: 'northEast', requirement: 'quiz' }
		],
		learningGoals: [
			'Know Golden Gate Bridge opened in 1937.',
			'Observe why bridges connect separated land masses.',
			'Recognize street art as local cultural expression.'
		],
		interactiveTasks: [
			'Repair one bridge cable section.',
			'Follow the painted street art route uphill.',
			'Add support blocks beneath a steep road.'
		],
		landmarkKits: ['Golden Gate span', 'Hill streets', 'Street art walls'],
		quizzes: [
			q(
				'sf-bridge',
				'Which famous bridge inspired this biome landmark?',
				['Golden Gate Bridge', 'Tower Bridge', 'Brooklyn Bridge'],
				0,
				'The long red-orange span is inspired by Golden Gate Bridge.'
			),
			q(
				'sf-year',
				'What year is shown for this bridge era?',
				['1937', '1859', '80 CE'],
				0,
				'1937 is the bridge opening year shown for this biome.'
			),
			q(
				'sf-art',
				'What do the colorful walls in side streets represent?',
				['Street art murals', 'Snow drifts', 'Desert dunes'],
				0,
				'The mural textures represent local street art culture.'
			)
		]
	}
];

export const BIOME_BY_ID = new Map<string, BiomeManifest>(BIOMES.map((biome) => [biome.id, biome]));

export function getBiomeOrDefault(id: string): BiomeManifest {
	return BIOME_BY_ID.get(id) ?? BIOME_BY_ID.get('grassland-origins')!;
}
