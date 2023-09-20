import { readFileSync, readFile, writeFileSync, statSync, unlinkSync, existsSync } from 'fs';

import { Locator, Page } from 'playwright';
import { answerRadioCheckboxQuestion, answerSelectQuestion, answerTextQuestion } from './questionOperations';

let page: Page;

const sessionVisitedIds: string[] = []; // Implemented this is used for the 24h rule
const sessionVisitedJobs: any = []; // TODO: Scrape all info to store in a separate file for history purposes

const forcedDelay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export default async function applyToJobs(jobsPage: Page) {
	page = jobsPage;
	// const jobSearchResults = await page.locator('.jobs-search-results-list');
	// const totalJobs = (await page.locator('.jobs-search-results-list__subtitle').innerText()).split(' ')[0];
	// console.log(totalJobs);

	await extractPage();

	storeVisitedIds(sessionVisitedIds);
	console.log('Job done boss');
}

async function extractPage(): Promise<void> {
	const data = await extractJob();

	if (!data) return await paginate();
	sessionVisitedJobs.push(data);
	sessionVisitedIds.push(data.JobId);

	return extractPage();
}

async function extractJob(): Promise<any> {
	try {
		await forcedDelay(randomRange(1, 2));
		if (await page.waitForSelector('.job-card-container', { timeout: 4000 })) {
			const jobCard: Locator = page.locator('.job-card-container').first();
			await jobCard.scrollIntoViewIfNeeded();

			// FIXME: JobData Interface
			const JobData: any = {
				id: await jobCard.getAttribute('data-job-id'),
				title: await jobCard.getByRole('link').innerText(),
				company: await jobCard.locator('.job-card-container__primary-description').innerText(),
			};

			if (await shouldBeRemoved(jobCard)) {
				await removeFromDom(jobCard);
				return await extractJob();
			}

			await forcedDelay(randomRange(1, 2));

			await jobCard.click();
			// await applyToJob();

			await removeFromDom(jobCard);
			return JobData;
		}
	} catch (err) {
		return null;
	}
}

async function shouldBeRemoved(jobCard: Locator): Promise<boolean> {
	// const hasVisited = visitedIDs.includes(JobId);

	// FIXME: Using temporary values

	const isPromoted = (await jobCard.innerText()).includes('Promoted');
	const isApplied = (await jobCard.innerText()).includes('Applied');
	const hasVisited = false; // temporary

	// const matchCompany = false; // todo
	// const isCompanyBlacklisted = false; // Todo
	// const matchJobTitle = false; // todo
	// const isJobTitleBlacklisted = false; //todo

	const conditionsArray: boolean[] = [isPromoted, isApplied, hasVisited];

	return conditionsArray.includes(true);
}

async function paginate(): Promise<void> {
	try {
		if (await page.waitForSelector('[class*="pagination__page-state"]', { timeout: 5000 })) {
			const pageIndicatorText = (await page.locator('[class*="pagination__page-state"]').innerText()).trim();
			const pageNumeration = pageIndicatorText.match(/\d+/g);

			const currPage = Number(pageNumeration[0]);
			const lastPage = Number(pageNumeration[1]);
			const hasMorePages = currPage < lastPage;

			if (!hasMorePages) return;

			page.getByLabel(`Page ${currPage + 1}`).click();
			return extractPage();
		}
	} catch (err) {
		return;
	}
}

async function removeFromDom(container: Locator): Promise<void> {
	await container.evaluate((job) => {
		document.querySelector('.job-card-container').remove();
	});
}

async function applyToJob() {
	const jobDescriptionContainer = page.locator('.jobs-search__job-details--container');
	await forcedDelay(randomRange(3, 5));
	await jobDescriptionContainer.getByRole('button', { name: 'Easy Apply' }).click(); // Try role grab kek

	// Insert await for modal !
	if ((await page.waitForSelector('.jobs-easy-apply-modal')).isVisible()) {
		const modal = page.locator('.jobs-easy-apply-modal');

		await nextFormStep(modal);

		const allQuestions = modal.locator('.jobs-easy-apply-form-section__grouping');
		for (let i = 0; i < (await allQuestions.count()); i++) {
			const question = allQuestions.nth(i);

			separatedLog(`Question: ${i + 1}`);

			if (question.locator('label')) await answerTextQuestion(question);
			else if (question.locator('fieldset')) await answerRadioCheckboxQuestion(question);
			else if (question.locator('select')) await answerSelectQuestion(question);
		}
	}
}

async function nextFormStep(modal: Locator) {
	await forcedDelay(randomRange(1, 2));
	const form = modal.locator('form');
	const modalPageTitle = (await form.locator('h3').first().innerText()).trim();

	// TODO: If submit application is available just click it !

	// Todo: Read and adapt heading for:
	// Contact info / Home address / Resume /
	// Work experience / Education / Voluntary self identification
	// Screening questions / Privacy policy / Additional / Perguntas Adicionais

	// if (modalPageTitle === 'Perguntas adicionais' || modalPageTitle === 'Additional Questions') {
	if (!['Perguntas adicionais', 'Additional Questions', 'Additional'].includes(modalPageTitle)) {
		await form.locator('button').filter({ hasText: 'Next' }).click();
		await nextFormStep(modal);
	}
}

function storeVisitedIds(sessionVisitedIds: string[]) {
	// Read about stream and maybe implement it to speed up the performance in the future
	const IdStoragePath = './storage/visitedID.json';

	// const IDQuantity = sessionVisitedIds.length;
	const IDQuantity = 0; // FIXME: temporary value to develop the apply module
	console.log('IDQuantity is using 0 !!');

	if (IDQuantity < 1) return console.log('You are all caught up: ' + IDQuantity);

	if (!existsSync('./storage/visitedID.json'))
		return writeFileSync(IdStoragePath, JSON.stringify(sessionVisitedIds), 'utf8');

	const { birthtime } = statSync(IdStoragePath);
	const fileTime: number = birthtime.getTime();
	const currentTime: number = new Date().getTime();
	const isMoreThan24h: boolean = Math.round((currentTime - fileTime) / 1000) >= 86400;

	if (!isMoreThan24h) {
		const storedIds = JSON.parse(readFileSync(IdStoragePath, 'utf8'));
		const newStoredIDs = storedIds.concat(sessionVisitedIds);
		writeFileSync(IdStoragePath, JSON.stringify(newStoredIDs), 'utf8');
	} else {
		unlinkSync(IdStoragePath);
		writeFileSync(IdStoragePath, JSON.stringify(sessionVisitedIds), 'utf8');
	}
}

function separatedLog(contents: string) {
	console.log('/// --------------');
	console.log(contents);
	console.log('/// --------------');
}

function randomRange(min: number, max: number) {
	// return parseFloat((Math.random() * (max - min) + min).toFixed(5));
	return parseFloat((Math.random() * (max - min) + min).toFixed(5)) * 1000;
}
