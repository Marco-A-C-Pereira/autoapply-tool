import { readFileSync, readFile, writeFileSync } from 'fs';
import { option, optionQuestion, textQuestion } from '../../interfaces/question';
import { Locator } from 'playwright';
import { parse } from 'yaml';

const questionsPath = './storage/questions.json';
const forcedDelay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const { manualMode, questionTimer } = parse(readFileSync('config.yaml').toString()).config;

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

function checkTextQuestion(scrapedHeading: string, questionType: 'text' | 'textArea'): textQuestion | null {
	const questions = JSON.parse(readFileSync(questionsPath, 'utf8')).textQuestion[questionType];
	const matchingQuestion: textQuestion[] = questions.filter((question: textQuestion) => {
		const questionExists = question.heading === scrapedHeading;
		const notEmpty = question.answer !== '' || undefined;

		return questionExists && notEmpty;
	});

	return matchingQuestion.length > 0 ? matchingQuestion[0] : null;
}

function checkOptionsQuestion(
	scrapedHeading: string,
	questionType: 'radio' | 'checkbox' | 'select'
): optionQuestion | null {
	const questions = JSON.parse(readFileSync(questionsPath, 'utf8')).optionQuestion[questionType];
	const matchingQuestion: optionQuestion[] = questions.filter((question: optionQuestion) => {
		const questionExists = question.heading === scrapedHeading;
		const hasAnswer = question.options.filter((option) => option.isAnswer === true).length > 0;

		return questionExists && hasAnswer;
	});

	return matchingQuestion.length > 0 ? matchingQuestion[0] : null;
}

async function answerTextQuestion(question: Locator) {
	const sentenceHeader = (await question.locator('label').innerText()).trim();

	const questionType = question.locator('input[type=text]').isVisible() ? 'text' : 'textArea';
	const textInput: Locator =
		questionType === 'text' ? question.locator('input[type=text]') : question.locator('textarea');

	const existingQuestion: textQuestion = checkTextQuestion(sentenceHeader, questionType);

	if (existingQuestion) return textInput.type(existingQuestion.answer, { delay: 100 });
	await terminalCountdown();

	const textQuestionObject: textQuestion = {
		heading: sentenceHeader,
		answer: (await textInput.inputValue()).trim(),
	};

	console.log(textQuestionObject);

	saveTextQuestion(textQuestionObject, questionType);
}

async function answerRadioCheckboxQuestion(question: Locator) {
	const sentenceHeader = (await question.locator('legend').innerText()).trim();
	const questionType = question.locator('input[type=radio]').isVisible() ? 'radio' : 'checkbox';
	const optionsContainers = question.locator('.fb-text-selectable__option');

	const existingQuestion: optionQuestion = checkOptionsQuestion(sentenceHeader, questionType);
	if (existingQuestion) {
		for (let i = 0; i < (await optionsContainers.count()); i++) {
			const optionsContainer = optionsContainers.nth(i);

			const optionHeading = (await optionsContainer.locator('label').innerText()).trim();
			const matchingQuestion = existingQuestion.options.filter(
				(option) => option.optionHeading === optionHeading && option.isAnswer
			);

			if (matchingQuestion.length > 0) await optionsContainer.locator('input').click();
		}
	} else {
		await terminalCountdown();
		const optionsList: option[] = [];

		for (let i = 0; i < (await optionsContainers.count()); i++) {
			const optionsContainer = optionsContainers.nth(i);

			const optionHeading = (await optionsContainer.locator('label').innerText()).trim();
			const isChecked = await optionsContainer.locator('input').isChecked();

			isChecked
				? optionsList.push({ optionHeading: optionHeading, isAnswer: true })
				: optionsList.push({ optionHeading: optionHeading });
		}

		const optionQuestionObject: optionQuestion = {
			heading: sentenceHeader,
			options: optionsList,
		};

		saveOptionsQuestion(optionQuestionObject, questionType);
	}
}

async function answerSelectQuestion(question: Locator) {
	// Input Select (1º <option> is the label)
	const sentenceHeader = (await question.locator('label').textContent()).trim();
	const answers: Locator = question.locator('option');

	const existingQuestion: optionQuestion = checkOptionsQuestion(sentenceHeader, 'select');
	if (existingQuestion) {
		// for (let i = 0; i < (await answers.count()); i++) {
		// 	const currentAnswer = answers.nth(i);
		// 	const currentAnswerText = await currentAnswer.innerText();

		// 	const filteredAnswer = existingQuestion.options.filter((option) => {
		// 		const matchHeading = currentAnswerText === option.optionHeading;
		// 		const isAnswer = option.isAnswer === true; // Probs will give out an error !!!!!!

		// 		return matchHeading && isAnswer;
		// 	});

		// 	if (filteredAnswer.length > 0) return question.selectOption(filteredAnswer[0].optionHeading);
		// }

		const filteredAnswer = existingQuestion.options.find((option) => option.isAnswer === true);
		question.locator('select', { hasText: filteredAnswer.optionHeading }).click();
	} else {
		await terminalCountdown();
		const optionsList: option[] = [];

		for (let i = 0; i < (await answers.count()); i++) {
			const currentAnswer = answers.nth(i);
			const currentAnswerText = await currentAnswer.innerText();

			const isSelected = question.getAttribute('selected') !== null;
			isSelected
				? optionsList.push({ optionHeading: currentAnswerText, isAnswer: true })
				: optionsList.push({ optionHeading: currentAnswerText });
		}

		const optionQuestionObject: optionQuestion = {
			heading: sentenceHeader,
			options: optionsList,
		};

		saveOptionsQuestion(optionQuestionObject, 'select');
	}
}

export { answerTextQuestion, answerRadioCheckboxQuestion, answerSelectQuestion };

async function terminalCountdown() {
	let counter = questionTimer;
	console.log(`You have ${questionTimer} seconds to answer the question in the browser`);
	const timer = setInterval(() => {
		counter--;
		process.stdout.write(`clock: ${counter}\r`);
		if (counter === 0) clearInterval(timer);
	}, 1000);
	await forcedDelay(questionTimer * 1000); // Possible Bug
}
