import type { PracticeRequest } from '#lib/domain';
export function demoPractice(
	input: Omit<PracticeRequest, 'research'> & { research?: boolean },
) {
	const spanish = input.profile.language === 'es';
	const science = ['science', 'nature'].includes(input.sourceType);
	if (input.mode === 'speaking' && input.readingUnit) {
		const samples = spanish
			? {
					words: 'por la mañana\n\ncamino\n\ncon mi amiga\n\npor el parque',
					sentences:
						'Hola, soy Ana.\n\nVivo cerca de un parque.\n\nMe gusta caminar.',
					paragraph:
						'Hola, soy Ana. Vivo cerca de un parque. Por la mañana camino con mi amiga. Vemos árboles y escuchamos a los pájaros.',
					article:
						'Vivo cerca de un parque pequeño. Por la mañana camino con mi amiga. Vemos árboles y escuchamos a los pájaros. El parque es un lugar tranquilo.\n\nPor la tarde hay muchas personas. Algunas juegan y otras leen. Me gusta sentarme bajo un árbol con un libro. Siempre encuentro algo interesante.\n\nLos fines de semana vamos juntos al parque. Llevamos agua y algo de comer. Después recogemos todo y volvemos a casa. Es una forma sencilla de disfrutar del día.',
				}
			: {
					words: 'ar maidin\n\ntéim\n\nle mo chara\n\ngo dtí an pháirc',
					sentences:
						'Dia duit.\n\nTá mé sa pháirc.\n\nIs maith liom na crainn.',
					paragraph:
						'Tá páirc in aice le mo theach. Téim ann le mo chara. Feicimid crainn agus éin. Is maith linn siúl sa pháirc.',
					article:
						'Tá páirc bheag in aice le mo theach. Téim ann le mo chara ar maidin. Feicimid crainn agus éin. Bíonn an áit ciúin go luath ar maidin.\n\nSan iarnóin bíonn daoine eile sa pháirc. Bíonn páistí ag imirt agus daoine ag siúl. Is maith liom suí faoi chrann agus leabhar a léamh.\n\nAg an deireadh seachtaine téann mo chlann ann le chéile. Bíonn uisce agus bia againn. Tugaimid ár mbruscar abhaile linn. Is áit mhaith í an pháirc dúinn go léir.',
				};
		return {
			sources: [],
			title: 'First steps in reading',
			prompt:
				input.readingUnit === 'words'
					? 'A morning walk in the park: listen to each chunk, then say the chunks together.'
					: 'Listen, then repeat at your own pace.',
			script: samples[input.readingUnit],
			vocabulary:
				input.readingUnit === 'words'
					? spanish
						? [
								'por la mañana · in the morning',
								'camino · I walk',
								'con mi amiga · with my friend',
								'por el parque · through the park',
							]
						: [
								'ar maidin · in the morning',
								'téim · I go',
								'le mo chara · with my friend',
								'go dtí an pháirc · to the park',
							]
					: spanish
						? ['hola · hello', 'casa · house', 'parque · park']
						: ['dia duit · hello', 'teach · house', 'páirc · park'],
			focus: 'Fixed beginner sample: familiar everyday language.',
			sourceNote:
				'A fixed beginner sample for this training unit. It is not personalised to your topic or language level.',
		};
	}
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
