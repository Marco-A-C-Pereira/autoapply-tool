import { Browser, BrowserContext, Locator, Page, chromium } from 'playwright';
import { readFileSync, existsSync } from 'fs';
import { parse } from 'yaml';
import queryBuilder from './modules/linkedIn/urlQuery';

import applyToJobs from './modules/linkedIn/jobPageOperations';

let browser: Browser;
let context: BrowserContext;
const data = parse(readFileSync('config.yaml').toString());
const visitedIDs: string[] = ((): string[] => {
	if (existsSync('./storage/visitedID.json')) return JSON.parse(readFileSync('./storage/visitedID.json', 'utf8'));
	return [];
})();

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

(async () => {
	browser = await chromium.launch({ headless: false, slowMo: 50 });
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
	await applyToJobs(page);

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
