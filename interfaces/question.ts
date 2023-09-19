interface question {
	heading: string;
}

export interface option {
	optionHeading: String;
	isAnswer?: boolean;
}

export interface textQuestion extends question {
	answer: string;
}

export interface optionQuestion extends question {
	options: option[];
}
