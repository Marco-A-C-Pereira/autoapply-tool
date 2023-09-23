import { readFileSync, readFile, writeFileSync } from 'fs';
import { option, optionQuestion, textQuestion } from '../../interfaces/question';
import { Locator } from 'playwright';
import { parse } from 'yaml';

const questionsPath = './storage/questions.json';
const forcedDelay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const { manualMode, questionTimer } = parse(readFileSync('config.yaml').toString()).config;

function saveTextQuestion(textQuestionObject: textQuestion, questionType: 'text' | 'textArea') {
	const json = JSON.parse(readFileSync(questionsPath, 'utf-8'));
	const questionAlreadyExists: textQuestion | undefined = json.textQuestion[questionType].find(
		(question: textQuestion) => textQuestionObject.heading === question.heading
	);

	if (questionAlreadyExists) return;

	json.textQuestion[questionType].push(textQuestionObject);
	writeFileSync(questionsPath, JSON.stringify(json), 'utf8');
}

function saveOptionsQuestion(optionsQuestionObject: optionQuestion, questionType: 'radio' | 'checkbox' | 'select') {
	const json = JSON.parse(readFileSync(questionsPath, 'utf-8'));
	const questionAlreadyExists: optionQuestion | undefined = json.optionQuestion[questionType].find(
		(question: optionQuestion) => optionsQuestionObject.heading === question.heading
	);

	if (questionAlreadyExists) return;

	json.optionQuestionQuestion[questionType].push(optionsQuestionObject);
	writeFileSync(questionsPath, JSON.stringify(json), 'utf8');
}

function checkTextQuestion(scrapedHeading: string, questionType: 'text' | 'textArea'): textQuestion | null {
	const questions: textQuestion[] = JSON.parse(readFileSync(questionsPath, 'utf8')).textQuestion[questionType];

	const matchingQuestion: textQuestion = questions.find((question: textQuestion) => {
		const questionExists = question.heading === scrapedHeading;
		const notEmpty = question.answer !== '' || undefined;

		return questionExists && notEmpty;
	});

	return matchingQuestion ? matchingQuestion : null;
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
	const textInputField = questionType === 'text' ? question.locator('input[type=text]') : question.locator('textarea');
	const textInputValue = await textInputField.inputValue();

	const existingQuestion: textQuestion | null = checkTextQuestion(sentenceHeader, questionType);

	const isAlreadyFilled = textInputValue !== (undefined || null || '');
	const isZero = textInputValue == '0';

	if (isZero) return false;
	if (isAlreadyFilled) return true;
	if (existingQuestion) {
		await textInputField.type(existingQuestion.answer, { delay: 100 });
		return true;
	}

	separatedLog(sentenceHeader);
	await terminalCountdown(); // TODO:Make this optional in the config for "fast mode" / Just scraping for latter

	const textQuestionObject: textQuestion = {
		heading: sentenceHeader,
		answer: (await textInputField.inputValue()).trim(),
	};

	saveTextQuestion(textQuestionObject, questionType);

	return textQuestionObject.answer !== (undefined || null || '') ? true : false;
}

async function answerRadioCheckboxQuestion(question: Locator) {
	const sentenceHeader = (await question.locator('legend').innerText()).trim();
	const questionType = question.locator('input[type=radio]').isVisible() ? 'radio' : 'checkbox';
	const optionsContainers = question.locator('.fb-text-selectable__option');

	for (const optionsContainer of await optionsContainers.all()) {
		const isChecked = await optionsContainer.locator('input').isChecked();

		if (isChecked) return true;
	}

	const existingQuestion: optionQuestion = checkOptionsQuestion(sentenceHeader, questionType);
	if (existingQuestion) {
		// TODO: Optimize with hasText ?
		for (const optionsContainer of await optionsContainers.all()) {
			const optionHeading = (await optionsContainer.locator('label').innerText()).trim();
			const matchingQuestion = existingQuestion.options.find(
				(option) => option.optionHeading === optionHeading && option.isAnswer
			);

			if (matchingQuestion) await optionsContainer.locator('input').check();
		}

		return true;
	}

	separatedLog(sentenceHeader);
	await terminalCountdown();
	const optionsList: option[] = [];

	for (const optionsContainer of await optionsContainers.all()) {
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

	const wasAnswered = optionQuestionObject.options.find((option) => option.isAnswer === true);
	return wasAnswered ? true : false;
}

async function answerSelectQuestion(question: Locator) {
	const sentenceHeader = (await question.locator('label').textContent()).trim();
	const answers: Locator = question.locator('option');

	console.log('Its me selectquestion');
	const existingQuestion: optionQuestion | null = checkOptionsQuestion(sentenceHeader, 'select');
	console.log('Sentencequestion Result: ' + existingQuestion);

	if (existingQuestion) {
		const filteredAnswer = existingQuestion.options.find((option) => option.isAnswer === true);
		question.locator('select', { hasText: filteredAnswer.optionHeading }).click();

		return true;
	}

	separatedLog(sentenceHeader);
	await terminalCountdown();
	const optionsList: option[] = [];

	for (const currentAnswer of await answers.all()) {
		const currentAnswerText = await currentAnswer.innerText();

		// FIXME: Probably gonna give out an error !!! I Don't see it when selecting manually in the webpage
		const isSelected = question.getAttribute('selected') !== null;
		//
		isSelected
			? optionsList.push({ optionHeading: currentAnswerText, isAnswer: true })
			: optionsList.push({ optionHeading: currentAnswerText });
	}

	const optionQuestionObject: optionQuestion = {
		heading: sentenceHeader,
		options: optionsList,
	};

	saveOptionsQuestion(optionQuestionObject, 'select');

	const wasAnswered = optionQuestionObject.options.find((option) => option.isAnswer === true);
	return wasAnswered ? true : false;
}

async function treatQuestion(question: Locator) {
	let wasSuccessful: boolean;

	if (question.locator('label')) wasSuccessful = await answerTextQuestion(question);
	else if (question.locator('fieldset')) wasSuccessful = await answerRadioCheckboxQuestion(question);
	else if (question.locator('select')) wasSuccessful = await answerSelectQuestion(question);

	return wasSuccessful;
}

export { treatQuestion };

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

function separatedLog(contents: string) {
	console.log('/// --------------');
	console.log(contents);
	console.log('/// --------------');
}
