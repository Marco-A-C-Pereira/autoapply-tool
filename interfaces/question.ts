interface question {
	heading: string;
}

export interface textQuestion extends question {
	answer: string;
	type: 'text' | 'textArea';
}

export interface optionQuestion extends question {
	options: [
		{
			optionHeading: String;
			isAnswer?: boolean;
			type: 'radio' | 'select' | 'checkbox';
		}
	];
}
