import { Browser, BrowserContext, Locator, Page, chromium } from 'playwright';
import { readFileSync, readFile, writeFileSync, statSync, unlinkSync, existsSync } from 'fs';
import { parse } from 'yaml';
import queryBuilder from './modules/urlQuery';
import { option, optionQuestion, textQuestion } from './interfaces/question';
import {
	checkOptionsQuestion,
	checkTextQuestion,
	saveOptionsQuestion,
	saveTextQuestion,
} from './modules/questionOperations';

let browser: Browser;
let context: BrowserContext;
const data = parse(readFileSync('config.yaml').toString());
const visitedIDs: string[] = ((): string[] => {
	if (existsSync('./storage/visitedID.json')) {
		return JSON.parse(readFileSync('./storage/visitedID.json', 'utf8'));
	}
	return [];
})();

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

(async () => {
	browser = await chromium.launch({ headless: false, slowMo: 50 });
	// context = await browser.newContext(); // Just for testing
	context = await browser.newContext(
		(() => {
			if (existsSync('./storage/auth.json')) {
				return { storageState: './storage/auth.json' };
			}
		})()
	);
	let page = await context.newPage();
	await page.goto(data.url);

	console.time('AppStart');

	if (!page.url().includes(data.url)) {
		console.log('ops need to login first');
		await login(page);
	}

	await goToJobs(page);
	await jobsPageOperations(page);

	console.timeEnd('AppStart');
	await delay(20000);
	await context.close();
})()
	.catch((err) => console.log(err))
	.finally(() => browser.close());

async function login(page: Page) {
	await page.goto('https://www.linkedin.com/');
	await page.waitForLoadState('domcontentloaded');

	await page.getByLabel('Email or phone').type(data.login, { delay: 100 });
	await page.getByLabel('Email or phone').press('Tab');

	await page.getByLabel('Password', { exact: true }).type(data.password, { delay: 100 });
	await page.getByLabel('Password', { exact: true }).press('Enter');

	await page.waitForLoadState('domcontentloaded');
	await context.storageState({ path: './storage/auth.json' });
}

async function goToJobs(page: Page) {
	await page.goto(await queryBuilder());
	await page.waitForLoadState('domcontentloaded');
}

async function jobsPageOperations(page: Page) {
	// const jobSearchResults = await page.locator('.jobs-search-results-list');
	// const totalJobs = (await page.locator('.jobs-search-results-list__subtitle').innerText()).split(' ')[0];
	// console.log(totalJobs);

	const jobs: any = [];
	const sessionVisitedIds: string[] = [];

	await jobListLoop(page);

	IdsToJSON(sessionVisitedIds);

	/// --------------

	async function jobListLoop(page: Page): Promise<any> {
		const data = await extractJob(page);

		if (data) {
			jobs.push(data);
			sessionVisitedIds.push(data.JobId);

			return jobListLoop(page);
		} else {
			const morePages = await paginate(page);

			if (morePages) return jobListLoop(page);
			else console.log('Job done boss');
		}
	}

	async function extractJob(page: Page): Promise<any> {
		try {
			await delay(randomRange(1, 2));

			if (await page.waitForSelector('.job-card-container', { timeout: randomRange(4, 5) })) {
				const jobCard: Locator = page.locator('.job-card-container').first();
				await jobCard.scrollIntoViewIfNeeded();

				const JobId = await jobCard.getAttribute('data-job-id');
				const JobTitle: string = await jobCard.getByRole('link').innerText();
				const JobCompany: string = await jobCard.locator('.job-card-container__primary-description').innerText();

				// const isPromoted = (await jobCard.innerText()).includes('Promoted');
				// const hasVisited = visitedIDs.includes(JobId);
				const isPromoted = false;
				const isApplied = (await jobCard.innerText()).includes('Applied');
				const hasVisited = false;

				const matchCompany = false; // todo
				const isCompanyBlacklisted = false; // Todo
				const matchJobTitle = false; // todo
				const isJobTitleBlacklisted = false; //todo

				if (hasVisited || isPromoted || isApplied) {
					await removeFromDom(jobCard);

					return await extractJob(page);
				} else {
					await delay(randomRange(1, 2));

					await jobCard.click();
					await applyToJob(page);

					await removeFromDom(jobCard);
					return { JobId, JobTitle, JobCompany };
				}
			}
		} catch (err) {
			console.log('Error in the extracting phase');
			console.log(err);
			return null;
		}
	}

	async function paginate(page: Page): Promise<boolean> {
		try {
			// if (await page.waitForSelector('[class*="pagination__page-state"]', { timeout: randomRange(1, 3) * 1000 })) {
			// if (await page.waitForSelector('[class*="pagination__page-state"]', { timeout: randomRange(1, 3) * 1000 })) {

			// WaitForSelector Broke fix later
			const pageIndicatorText = (await page.locator('[class*="pagination__page-state"]').innerText()).trim();
			const pageNumeration = pageIndicatorText.match(/\d+/g);

			const currPage = Number(pageNumeration[0]);
			const lastPage = Number(pageNumeration[1]);

			if (currPage < lastPage) {
				page.getByLabel(`Page ${currPage + 1}`).click();
				return true;
			}

			return false;
			// }
		} catch (err) {
			console.log(err);

			return false;
		}
	}

	async function removeFromDom(container: Locator): Promise<void> {
		await container.evaluate((job) => {
			document.querySelector('.job-card-container').remove();
		});
	}

	async function applyToJob(page: Page) {
		// Probably gonna need an expect

		const jobDescriptionContainer = page.locator('.jobs-search__job-details--container');
		await delay(randomRange(3, 5));
		await jobDescriptionContainer.getByRole('button', { name: 'Easy Apply' }).click(); // Try role grab kek

		// Insert await for modal !
		if ((await page.waitForSelector('.jobs-easy-apply-modal')).isVisible()) {
			const modal = page.locator('.jobs-easy-apply-modal');

			await nextFormStep();

			// Todo: Read and adapt heading for:
			// Contact info / Home address / Resume /
			// Work experience / Education / Voluntary self identification
			// Screening questions / Privacy policy / Additional / Perguntas Adicionais

			// CV Part
			// THE NIGHTMARE BEGINS !!
			const allQuestions = modal.locator('.jobs-easy-apply-form-section__grouping');
			for (let i = 0; i < (await allQuestions.count()); i++) {
				const question = allQuestions.nth(i);

				// ----

				separatedLog('Question: ' + i + 1);

				if (question.locator('label')) {
					const sentence = question.locator('label');
					const sentenceText = (await sentence.innerText()).trim();

					const questionType = question.locator('input[type=text]').isVisible() ? 'text' : 'textArea';
					const textInput =
						questionType === 'text' ? question.locator('input[type=text]') : question.locator('textarea');

					const existingQuestion: textQuestion = checkTextQuestion(sentenceText, questionType);

					if (existingQuestion) {
						// if (existingQuestion && (await textInput.inputValue()) === '') {
						textInput.type(existingQuestion.answer, { delay: 100 });
					} else {
						if (data.options.manualMode) {
							terminalTimer(data.options.questionTimer);
							await delay(data.options.questionTimer * 1000);

							const textQuestionObject: textQuestion = {
								heading: sentenceText,
								answer: (await textInput.inputValue()).trim(),
							};

							console.log(textQuestionObject);

							saveTextQuestion(textQuestionObject, questionType);
						} else {
							// Todo: NLP ?
						}
					}

					//// ----
				} else if (question.locator('fieldset')) {
					const sentence = question.locator('legend');
					const sentenceText = (await sentence.innerText()).trim();
					const questionType = question.locator('input[type=radio]').isVisible() ? 'radio' : 'checkbox';
					const optionsList: option[] = [];
					const optionsContainers = question.locator('.fb-text-selectable__option');

					const existingQuestion: optionQuestion = checkOptionsQuestion(sentenceText, questionType);
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
						if (data.options.manualMode) {
							terminalTimer(data.options.questionTimer);
							await delay(data.options.questionTimer * 1000);

							for (let i = 0; i < (await optionsContainers.count()); i++) {
								const optionsContainer = optionsContainers.nth(i);

								const optionHeading = (await optionsContainer.locator('label').innerText()).trim();
								const isChecked = await optionsContainer.locator('input').isChecked();

								isChecked
									? optionsList.push({ optionHeading: optionHeading, isAnswer: true })
									: optionsList.push({ optionHeading: optionHeading });
							}

							const optionQuestionObject: optionQuestion = {
								heading: sentenceText,
								options: optionsList,
							};

							saveOptionsQuestion(optionQuestionObject, questionType);
						} else {
							// Todo: NLP ?
						}
					}
				} else if (question.locator('select')) {
					// Input Select (1º <option> is the label)
					const sentence = question.locator('option').first();
					separatedLog('Question:' + (await sentence.innerText()));

					// await extractQuestion('select', sentence);

					console.log('tem Select');
				}

				//// ----
			}

			async function nextFormStep() {
				await delay(randomRange(1, 2));
				const form = modal.locator('form');
				const modalPageTitle = (await form.locator('h3').first().innerText()).trim();

				// if (modalPageTitle === 'Perguntas adicionais' || modalPageTitle === 'Additional Questions') {
				if (!['Perguntas adicionais', 'Additional Questions', 'Additional'].includes(modalPageTitle)) {
					await form.locator('button').filter({ hasText: 'Next' }).click();
					await nextFormStep();
				}
			}
		}
	}
}

/// --------------

function randomRange(min: number, max: number) {
	// return parseFloat((Math.random() * (max - min) + min).toFixed(5));
	return parseFloat((Math.random() * (max - min) + min).toFixed(5)) * 1000;
}

function separatedLog(contents: string) {
	console.log('/// --------------');
	console.log(contents);
	console.log('/// --------------');
}

function terminalTimer(timeSeconds: number) {
	let counter = timeSeconds;
	console.log(`You have ${data.options.questionTimer} seconds to answer the question in the browser`);
	const timer = setInterval(() => {
		counter--;
		process.stdout.write(`clock: ${counter}\r`);
		if (counter === 0) clearInterval(timer);
	}, 1000);
}

/// --------------

function IdsToJSON(scrapedIds: string[]) {
	// Read about stream and maybe implement it to speed up the performance in the future
	const IdStoragePath = './storage/visitedID.json';

	// const isEmpty = scrapedIds.length;
	const isEmpty = 0; // TEMP VALUE
	console.log('IsEmpty is using 0 !!');

	try {
		if (isEmpty > 0) {
			if (existsSync('./storage/visitedID.json')) {
				const { birthtime } = statSync(IdStoragePath);
				const fileTime: number = birthtime.getTime();
				const currentTime: number = new Date().getTime();
				const isMoreThan24h: boolean = Math.round((currentTime - fileTime) / 1000) >= 86400;

				if (isMoreThan24h) {
					unlinkSync(IdStoragePath);
					writeFileSync(IdStoragePath, JSON.stringify(scrapedIds), 'utf8');
				} else {
					readFile(IdStoragePath, 'utf8', (err, data) => {
						const json = JSON.parse(data);
						const newJson = json.concat(scrapedIds);
						writeFileSync(IdStoragePath, JSON.stringify(newJson), 'utf8');
					});
				}
			} else {
				writeFileSync(IdStoragePath, JSON.stringify(scrapedIds), 'utf8');
			}
		} else {
			console.log('You are all caught up: ' + isEmpty);
		}
	} catch (err) {
		console.log(err);
	}
}
