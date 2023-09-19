import { readFileSync, readFile, writeFileSync } from 'fs';
import { optionQuestion, textQuestion } from '../interfaces/question';

const questionsPath = './storage/questions.json';

function saveTextQuestion(textQuestionObject: textQuestion, questionType: 'text' | 'textArea') {
	const json = JSON.parse(readFileSync(questionsPath, 'utf-8'));
	json.textQuestion[questionType].push(textQuestionObject);
	writeFileSync(questionsPath, JSON.stringify(json), 'utf8');
}

function saveOptionsQuestion(optionsQuestionObject: optionQuestion, questionType: 'radio' | 'checkbox' | 'select') {
	const json = JSON.parse(readFileSync(questionsPath, 'utf-8'));
	json.optionQuestionQuestion[questionType].push(optionsQuestionObject);
	writeFileSync(questionsPath, JSON.stringify(json), 'utf8');
}

function checkTextQuestion(heading: string, questionType: 'text' | 'textArea'): textQuestion | null {
	// Questions maybe will give out an error
	const questions = JSON.parse(readFileSync(questionsPath, 'utf8')).textQuestion[questionType];
	const matchingQuestion: textQuestion[] = questions.filter((question: textQuestion) => {
		return question.heading === heading && question.answer !== '';
	});

	return matchingQuestion.length > 0 ? matchingQuestion[0] : null;
}

function checkOptionsQuestion(heading: string, questionType: 'radio' | 'checkbox' | 'select'): optionQuestion | null {
	const questions = JSON.parse(readFileSync(questionsPath, 'utf8')).optionQuestion[questionType];
	const matchingQuestion: optionQuestion[] = questions.filter((question: optionQuestion) => {
		return question.heading === heading && question.options.filter((option) => option.isAnswer === true).length > 0;
	});

	return matchingQuestion.length > 0 ? matchingQuestion[0] : null;
}

export { checkOptionsQuestion, checkTextQuestion, saveOptionsQuestion, saveTextQuestion };
