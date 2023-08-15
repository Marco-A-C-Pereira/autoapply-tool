import { parse } from 'yaml';
import { readFileSync } from 'node:fs';

const data = parse(readFileSync('config.yaml').toString());

(async () => {
	await queryBuilder();
})();

export default async function queryBuilder(): Promise<string> {
	const url: URL = new URL('https://www.linkedin.com/jobs/search/'); // Use one of the visited jobsIds to make it more trustworthy ?
	const searchParams = new URLSearchParams();
	const { underTenApplicants, jobType, datePosted, experienceLevel, geoId, location, sortBy, workModel } =
		data.jobSearch.filters;
	const filtersDictionary = {
		f_AL: true, // Easy apply
		f_E: urlEncode(experienceLevel, ',', '%2C'), // Experience Level
		f_EA: underTenApplicants, // Under 10 Applicants
		f_JT: jobType, // Job type
		f_TPR: datePosted, // Date Posted
		f_WT: workModel, // Work Model
		geoId: geoId, // GeoID
		// keywords: data.jobSearch.keyword, // Keywords
		keywords: urlEncode(data.jobSearch.keyword, ' ', '%20'), // Keywords
		location: location, // Location
		refresh: true, // Refresh
		sortBy: sortBy, // Sort by
	};

	for (const [key, value] of Object.entries(filtersDictionary)) {
		if (isFilled(value)) searchParams.append(key, value);
	}

	const ReadyQuery = decodeURI(searchParams.toString());

	return `${url}?${ReadyQuery}`;

	/// ---------------------

	function isFilled(filterProp: any | any[]): boolean {
		return (filterProp && filterProp.length > 0) || filterProp;
	}

	function urlEncode(array: string[], target: string, replacer: string) {
		const regex = new RegExp(target, 'g');
		return array.toString().replace(regex, replacer);
	}
}

async function oldqueryBuilder() {
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
