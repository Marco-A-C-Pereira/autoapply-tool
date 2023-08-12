import { Browser, BrowserContext, Locator, Page, chromium } from 'playwright';
import { readFileSync, readFile, writeFileSync, statSync, unlinkSync, existsSync } from 'fs';
import { parse } from 'yaml';

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
	// context = await browser.newContext({ storageState: './storage/auth.json' });
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

	await page.goto(await queryBuilder());
	await page.waitForLoadState('domcontentloaded');

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

async function queryBuilder() {
	// const expected = `https://www.linkedin.com/jobs/search/?currentJobId=3688942139
	// &f_AL=true
	// &f_E=1%2C4%2C5
	// &f_EA=true
	// &f_JT=F
	// &f_TPR=r3600
	// &f_WT=2
	// &geoId=106057199
	// &keywords=React
	// &location=Brazil
	// &refresh=true
	// &sortBy=DD
	// `;

	const jobParameters = data.jobSearch;
	const filters = data.jobSearch.filters;

	const buildQuery = `https://www.linkedin.com/jobs/search/?currentJobId=3688942139
	&f_AL=true
    ${paramExists(filters.experienceLevel) ? '&f_E=' + prepareJobExperienceLevel(filters.experienceLevel) : ''}
    ${paramExists(filters.underTenApplicants) ? '&f_EA=' + filters.underTenApplicants : ''}
    ${paramExists(filters.jobType) ? '&f_JT=' + filters.jobType : ''}
    ${paramExists(filters.datePosted) ? '&f_TPR=r' + filters.datePosted : ''}
    ${paramExists(filters.workModel) ? '&f_WT=' + filters.workModel : ''}
	&geoId=${filters.geoId}
	&keywords=${prepareKeyWords(jobParameters.keyword)}
	&location=${filters.location}
	&refresh=true
    ${paramExists(filters.sortBy) ? '&sortBy=' + filters.sortBy : ''}
	`;

	return buildQuery.replace(/\s/g, '');

	// 'or just use fucking string.replace()'
	function addUrlEncodingSymbol(param: string[], symbol: string) {
		// %20 = %
		// %2C = ,

		let lastElem = param.pop();
		return param.map((param) => param + (symbol === '%' ? '%20' : '%2C')).join('') + lastElem;
	}

	function _() {
		return 'a';
	}

	function paramExists(param: string | any[]): boolean {
		if (!param) {
			return false;
		} else if (param && param.length == 0) {
			return false;
		} else return true;
	}

	function prepareKeyWords(keywords: string[]): string {
		if (keywords.length == 0) {
			throw new Error('Please input a keyword in the config.yaml');
		} else if (keywords.length == 1) {
			return keywords[0];
		} else {
			return addUrlEncodingSymbol(keywords, '%');
		}
	}

	function prepareJobExperienceLevel(params: string[]): string {
		if (params.length == 1) {
			return params[0];
		} else {
			return addUrlEncodingSymbol(params, ',');
		}
	}
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

	let jobDescriptionContainer = page.locator('.jobs-search__job-details');

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
			await delay(randomRange(1, 2) * 1000);

			if (await page.waitForSelector('.job-card-container', { timeout: randomRange(4, 5) * 1000 })) {
				// Beta feature !!
				const jobCard: Locator = page.locator('.job-card-container').first();
				await jobCard.scrollIntoViewIfNeeded();

				const JobId = await jobCard.getAttribute('data-job-id');
				const isPromoted = (await jobCard.innerText()).includes('Promoted');

				if (visitedIDs.includes(JobId) || isPromoted) {
					await removeFromDom(jobCard);

					return await extractJob(page);
				} else {
					await delay(randomRange(1, 2) * 1000);

					const JobTitle: string = await jobCard.getByRole('link').innerText();
					const JobCompany: string = await jobCard.locator('.job-card-container__primary-description').innerText();

					// jobCard.click(); // Todo: Ative when going to subscribe
					// await delay(2 * 1000); // hardcoded change later !!!

					await removeFromDom(jobCard);
					return { JobId, JobTitle, JobCompany };
				}
			}
		} catch (err) {
			// console.log(err);
			return null;
		}
	}

	async function paginate(page: Page): Promise<boolean> {
		try {
			// if (await page.waitForSelector('[class*="pagination__page-state"]', { timeout: randomRange(1, 3) * 1000 })) {
			// if (await page.waitForSelector('[class*="pagination__page-state"]', { timeout: randomRange(1, 3) * 1000 })) {

			// Waiforselector Broke fix later
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
}

/// --------------

function randomRange(min: number, max: number) {
	return Math.random() * (max - min) + min;
}

function IdsToJSON(scrapedIds: string[]) {
	// Read about stream and maybe implement it to speed up the performance in the future
	const IDCollectionPath = './storage/visitedID.json';

	const isEmpty = scrapedIds.length;
	console.log(scrapedIds);

	try {
		if (isEmpty > 0) {
			if (existsSync('./storage/visitedID.json')) {
				const { birthtime } = statSync(IDCollectionPath);
				const fileTime = birthtime.getTime();
				const currentTime = new Date().getTime();

				if (Math.round((currentTime - fileTime) / 1000) >= 86400) {
					unlinkSync(IDCollectionPath);
					writeFileSync(IDCollectionPath, JSON.stringify(scrapedIds), 'utf8');
				} else {
					readFile(IDCollectionPath, 'utf8', (err, data) => {
						const json = JSON.parse(data);
						const newJson = json.concat(scrapedIds);
						writeFileSync(IDCollectionPath, JSON.stringify(newJson), 'utf8');
					});
				}
			} else {
				writeFileSync(IDCollectionPath, JSON.stringify(scrapedIds), 'utf8');
			}
		} else {
			console.log('You are all caught up: ' + isEmpty);
		}
	} catch (err) {
		console.log(err);
	}
}
