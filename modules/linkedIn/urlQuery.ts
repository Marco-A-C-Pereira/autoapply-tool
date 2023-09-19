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
