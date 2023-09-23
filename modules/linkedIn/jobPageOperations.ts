import { readFileSync, readFile, writeFileSync, statSync, unlinkSync, existsSync } from 'fs';

import { Locator, Page } from 'playwright';
import { treatQuestion } from './questionOperations';
import { IApplication } from '../../interfaces/application';
import { parse } from 'yaml';

let page: Page;

const { blacklistedJobTitles }: { blacklistedJobTitles: string[] } = parse(
	readFileSync('config.yaml').toString()
).jobSearch;

const sessionVisitedIds: string[] = []; // Implemented this is used for the 24h rule
const sessionAppliedJobs: IApplication[] = []; // TODO: Scrape all info to store in a separate file for history purposes

export default async function applyToJobs(jobsPage: Page) {
	page = jobsPage;
	// const jobSearchResults = await page.locator('.jobs-search-results-list');
	// const totalJobs = (await page.locator('.jobs-search-results-list__subtitle').innerText()).split(' ')[0];
	// console.log(totalJobs);

	await extractPage();

	storeVisitedIds(sessionVisitedIds);
	storeJobs(sessionAppliedJobs);
	console.log('Job done boss');
}

async function extractPage(): Promise<void> {
	const data = await extractJob();

	if (!data) return await paginate();
	sessionAppliedJobs.push(data);
	sessionVisitedIds.push(data.JobId);

	return extractPage();
}

async function extractJob(): Promise<any> {
	try {
		await humanLikeDelay(1, 2);
		if (await page.waitForSelector('.job-card-container', { timeout: 4000 })) {
			const jobCard: Locator = page.locator('.job-card-container').first();
			await jobCard.scrollIntoViewIfNeeded();

			if (await shouldBeRemoved(jobCard)) {
				await removeFromDom(jobCard);
				return await extractJob();
			}

			await humanLikeDelay(1, 2);

			await jobCard.click();
			const successfulApply = await applyToJob();

			const JobData: IApplication = {
				id: await jobCard.getAttribute('data-job-id'),
				title: await jobCard.getByRole('link').innerText(),
				company: await jobCard.locator('.job-card-container__primary-description').innerText(),
				applied: successfulApply,
				creationDate: new Date(),
			};

			await removeFromDom(jobCard);
			return JobData;
		}
	} catch (err) {
		console.log(err);
		// FIXME: If the is any erros in this part it crashes the application so I need to remove the offender DOM item and try again !

		return null;
	}
}

async function shouldBeRemoved(jobCard: Locator): Promise<boolean> {
	// const hasVisited = visitedIDs.includes(JobId);

	// FIXME: Using temporary values

	const isPromoted = (await jobCard.innerText()).includes('Promoted');
	const isApplied = (await jobCard.innerText()).includes('Applied');
	const haveBlacklistedTitle = await evaluateJobTitle();
	const hasVisited = false; // temporary

	// const matchCompany = false; // todo
	// const isCompanyBlacklisted = false; // Todo
	// const matchJobTitle = false; // todo

	const conditionsArray: boolean[] = [isPromoted, isApplied, hasVisited, haveBlacklistedTitle];

	return conditionsArray.includes(true);

	async function evaluateJobTitle(): Promise<boolean> {
		const jobCardTitleWords = (await jobCard.getByRole('link').innerText()).trim().split(' ');

		return jobCardTitleWords.some((titleWord) =>
			blacklistedJobTitles.map((jobTitle) => jobTitle.toLowerCase()).includes(titleWord.toLowerCase())
		);
	}
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
	await humanLikeDelay(3, 5);
	await jobDescriptionContainer.getByRole('button', { name: 'Easy Apply' }).click();
	const answerStatus: boolean[] = [];

	// FIXME:Is this nesting necessary ?
	if ((await page.waitForSelector('.jobs-easy-apply-modal')).isVisible()) {
		const modal = page.locator('.jobs-easy-apply-modal');

		await nextFormStep(modal);
		if (await submitWithoutQuestions(modal)) return finishApply(modal); // a bit clunky but it should work

		const allQuestions = modal.locator('.jobs-easy-apply-form-section__grouping');

		for (const question of await allQuestions.all()) answerStatus.push(await treatQuestion(question));

		const problemWithQuestion = answerStatus.includes(false);
		console.log(problemWithQuestion);

		if (problemWithQuestion) {
			console.log('Job application failed, questions no answer');

			await cancelApply(modal);
			return false;
		}

		const problemWithApply = await finishApply(modal);
		if (problemWithApply) return false;

		console.log('Job application success');
		return true;
	}
}

async function nextFormStep(modal: Locator): Promise<void> {
	await humanLikeDelay(1, 2);
	const form = modal.locator('form');
	const modalPageTitle = (await form.locator('h3').first().innerText()).trim();
	const questionFormWords = ['Perguntas adicionais', 'Additional Questions', 'Additional', 'Preguntas adicionales'];
	// TODO: There must be another way for this !

	// TODO: Read and adapt heading for:
	// Contact info / Home address / Resume /
	// Work experience / Education / Voluntary self identification
	// Screening questions / Privacy policy / Additional / Perguntas Adicionais

	if (await submitWithoutQuestions(modal)) return;

	if (!questionFormWords.includes(modalPageTitle)) {
		await form.locator('button').filter({ hasText: 'Next' }).click();
		return await nextFormStep(modal);
	}

	return;
}

async function submitWithoutQuestions(modal: Locator): Promise<boolean> {
	return (
		(await modal.locator('button').filter({ hasText: 'Submit application' }).isVisible()) ||
		(await modal.locator('button').filter({ hasText: 'Review' }).isVisible())
	);
}

async function finishApply(modal: Locator) {
	try {
		await humanLikeDelay(2, 4);
		const ReviewIsVisible = await modal.locator('button').filter({ hasText: 'Review' }).isVisible();
		if (ReviewIsVisible) await modal.locator('button').filter({ hasText: 'Review' }).click();

		const subscribeCheckboxVisible = await modal.locator('.job-details-easy-apply-footer__section').isVisible();
		if (subscribeCheckboxVisible) {
			const subscribeContainer = await modal.locator('.job-details-easy-apply-footer__section');
			const subscribeLabel = await subscribeContainer.locator('label');
			await subscribeLabel.scrollIntoViewIfNeeded();
			await subscribeLabel.click();
		}

		const submitButtonVisible = await modal.locator('button').filter({ hasText: 'Submit application' }).isVisible();
		if (submitButtonVisible) await modal.locator('button').filter({ hasText: 'Submit application' }).click();

		// Causing crash ????????
		const postApplyModal = await page.locator('div[aria-labelledby="post-apply-modal"]');
		await postApplyModal.locator('button[aria-label="Dismiss"]').click();

		return false; // No problem with the apply process
	} catch (err) {
		console.log(err);

		cancelApply(modal);
		return true;
	}
}

async function cancelApply(applyModal: Locator) {
	applyModal.locator('button[aria-label="Dismiss"]').click();

	await page.locator('[data-test-modal-id="data-test-easy-apply-discard-confirmation"]').waitFor({ timeout: 10000 }); // FIXME: Can easily break
	const exitModal = page.locator('[data-test-modal-id="data-test-easy-apply-discard-confirmation"]');

	await exitModal.locator('button').filter({ hasText: 'Discard' }).click(); // Because of the annoying reminder on E-mail
}

function storeVisitedIds(sessionVisitedIds: string[]) {
	// Read about stream and maybe implement it to speed up the performance in the future
	const IdStoragePath = './storage/visitedID.json';

	// const IDQuantity = sessionVisitedIds.length;
	const IDQuantity = 0; // FIXME: temporary value to develop the apply module
	console.log('IDQuantity is using 0 !!');

	if (IDQuantity < 1) return console.log('You are all caught up: ' + IDQuantity);

	if (!existsSync(IdStoragePath)) writeFileSync(IdStoragePath, JSON.stringify(sessionVisitedIds), 'utf8');

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

function storeJobs(sessionAppliedJobs: IApplication[]) {
	const jobsStoragePath = './storage/appliedJobs.json';
	const deepSessionAppliedJobs: IApplication[] = JSON.parse(JSON.stringify(sessionAppliedJobs));

	if (!existsSync(jobsStoragePath)) writeFileSync(jobsStoragePath, JSON.stringify(sessionAppliedJobs), 'utf8');

	if (sessionAppliedJobs.length < 1) return "Didn't apply in any job";
	const storedApplications: IApplication[] = JSON.parse(readFileSync(jobsStoragePath, 'utf8'));

	// FIXME: This is will give out performance problems ! Maybe using a temporary file 24h will help ?
	const newApplications = storedApplications.map((storedApplication) => {
		const matchingJob = sessionAppliedJobs.find((appliedJob) => storedApplication.id === appliedJob.id);
		if (!matchingJob || storedApplication.applied === true || matchingJob.applied === false) return storedApplication;

		delete deepSessionAppliedJobs[sessionAppliedJobs.indexOf(matchingJob)];
		return matchingJob;
	});

	deepSessionAppliedJobs.map((application: IApplication | undefined) => {
		if (application !== undefined) newApplications.unshift(application);
	});

	writeFileSync(jobsStoragePath, JSON.stringify(newApplications), 'utf8');
}

function humanLikeDelay(min: number, max: number) {
	const forcedDelay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

	return forcedDelay(parseFloat((Math.random() * (max - min) + min).toFixed(5)) * 1000);
}
