import type { PracticeRequest } from './domain';

const samples = {
	en: {
		words: 'in the morning\n\nI walk\n\nwith my friend\n\nthrough the park',
		sentences:
			'I live near a park.\n\nI walk with my friend.\n\nWe watch the birds.',
		paragraph:
			'I live near a small park. In the morning I walk there with my friend. We look at the trees and listen to the birds. Sometimes we sit on a bench and talk about our day. I like this quiet place.',
		article:
			'There is a small park near my house. In the morning I walk there with my friend. We look at the trees and listen to the birds. The park is quiet early in the day.\n\nIn the afternoon more people visit the park. Some play games and others read. I like to sit under a tree with a book. There is always something interesting to see.\n\nAt the weekend my family goes to the park together. We bring water and a little food. Before we leave, we pick up our rubbish. A walk in the park is a simple way to enjoy the day.',
		science:
			'There is a plant by the window at home. Its leaves are green. Plants need light and water to grow. I check the soil before I water it. Sometimes I draw the plant to see how it changes. This week I want to watch a new leaf grow.',
		vocabulary: [
			'in the morning · early in the day',
			'I walk · I go on foot',
			'with my friend · together with someone I like',
			'through the park · from one part of the park to another',
		],
		scienceVocabulary: [
			'plant · a living thing with roots and leaves',
			'leaf · a flat green part of a plant',
			'light · what helps us see',
		],
	},
	ja: {
		words: '朝に\n\n友だちと\n\n公園を\n\n歩きます',
		sentences: '公園が近くにあります。\n\n友だちと歩きます。\n\n鳥を見ます。',
		paragraph:
			'家の近くに小さな公園があります。朝、友だちと公園を歩きます。木を見たり、鳥の声を聞いたりします。ときどき、ベンチに座って話します。静かな公園が好きです。',
		article:
			'家の近くに小さな公園があります。朝、友だちと公園を歩きます。木を見たり、鳥の声を聞いたりします。朝の公園は静かです。\n\n午後は人が多くなります。子どもたちは遊んでいます。本を読んでいる人もいます。私は木の下に座るのが好きです。\n\n週末は家族と公園に行きます。水と食べ物を持っていきます。帰る前に、ごみを拾います。公園で楽しい時間を過ごします。',
		science:
			'家の窓のそばに植物があります。葉は緑色です。植物が育つには光と水が必要です。水をあげる前に、土を見ます。ときどき植物の絵を描きます。今週は新しい葉をよく見たいです。',
		vocabulary: [
			'朝に · in the morning',
			'友だちと · with a friend',
			'公園を · through the park',
			'歩きます · walk',
		],
		scienceVocabulary: ['植物 · plant', '葉 · leaf', '光 · light'],
	},
};

export function languageDemo(input: PracticeRequest, language: 'en' | 'ja') {
	const sample = samples[language];
	const science = ['science', 'nature'].includes(input.sourceType);
	const readingUnit = input.mode === 'speaking' ? input.readingUnit : undefined;
	return {
		sources: [],
		title: readingUnit
			? 'First steps in reading'
			: science
				? 'A plant by the window'
				: 'A walk in the park',
		prompt: readingUnit
			? 'A morning walk in the park: listen, then repeat each item at your own pace.'
			: science
				? 'Describe a plant at home or school. Where is it? How do you care for it?'
				: 'Describe a place you know. What do you see there, and why do you like it?',
		script: readingUnit
			? sample[readingUnit]
			: science
				? sample.science
				: sample.paragraph,
		vocabulary:
			science && !readingUnit ? sample.scienceVocabulary : sample.vocabulary,
		focus: 'Fixed beginner sample: familiar everyday language.',
		sourceNote:
			'An original fixed beginner sample. It is not personalised to your topic or language level.',
	};
}
