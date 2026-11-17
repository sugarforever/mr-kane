import type { PracticeRequest } from '#lib/domain';
export function demoPractice(
	input: Omit<PracticeRequest, 'research'> & { research?: boolean },
) {
	const spanish = input.profile.language === 'es';
	const science = ['science', 'nature'].includes(input.sourceType);
	return {
		sources: [],
		title: science ? 'A plant by the window' : 'The way home',
		prompt: science
			? 'Look at a plant at home or school. Where is it? How do you care for it? Write a short paragraph about why light and water matter.'
			: 'Think of a real place you know. Describe what you see on your way home, what you like about it, and something you would like to notice next time.',
		script: spanish
			? science
				? 'Hay una planta junto a la ventana de mi casa. Sus hojas son verdes. Las plantas necesitan luz y agua para crecer. Yo miro la tierra antes de regarla. A veces hago un dibujo para ver cómo cambia. Esta semana quiero observar una hoja nueva. ¿Tienes alguna planta en casa o en tu escuela?'
				: 'Después de las clases, vuelvo a casa. En el camino hay un parque pequeño. A veces veo a mis amigos allí. Me gusta mirar los árboles y escuchar a los pájaros. No todos los días son iguales. Hoy quiero observar algo nuevo y escribir unas frases sobre ello. ¿Qué lugar te gusta de tu barrio?'
			: science
				? 'Tá planda in aice leis an bhfuinneog sa teach. Tá duilleoga glasa air. Bíonn solas agus uisce ag teastáil ó phlandaí. Breathnaím ar an ithir sula gcuirim uisce air. Is maith liom a bheith ag féachaint air ag fás. An bhfuil planda sa bhaile agat?'
				: 'Téim abhaile tar éis na scoile. Tá páirc bheag ar an mbealach. Feicim mo chairde ann uaireanta. Is maith liom na crainn agus na héin. Gach lá, feicim rud éigin nua. Ba mhaith liom cúpla abairt a scríobh faoi mo cheantar. Cad is maith leat faoi do cheantar féin?',
		vocabulary: spanish
			? science
				? ['planta · plant', 'hoja · leaf', 'luz · light']
				: ['barrio · neighbourhood', 'camino · path', 'observar · observe']
			: science
				? ['planda · plant', 'duilleog · leaf', 'solas · light']
				: ['páirc · park', 'crann · tree', 'ceantar · area'],
		focus:
			'Fixed A2 sample: describe your surroundings using the present tense. This sample is not tailored to your profile.',
		sourceNote: science
			? 'Established science: how plants grow. The reading script is an illustrative example.'
			: 'An everyday observation prompt. Experiences in the sample script are illustrative, not facts about you.',
	};
}
